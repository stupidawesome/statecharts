import { InvokeNode, StateDocument, StateNode, TransitionNode } from "./interfaces"
import {
    BlockingQueue,
    conditionMatch, documentOrder,
    entryOrder, exitOrder,
    getChildStates, getProperAncestors,
    HashTable, hasLegalCompletion,
    isAtomicState, isCancelEvent, isCompoundState, isCompoundStateOrScxmlElement, isDescendant,
    isFinalState, isHistoryState,
    isParallelState, isSCXMLElement,
    List, nameMatch, OrderedSet, Queue,
} from "./utils"

export abstract class BaseInterpreter {
    running: boolean
    configuration: OrderedSet<StateNode>
    statesToInvoke: OrderedSet<StateNode>
    internalQueue: Queue
    externalQueue: BlockingQueue
    historyValue: HashTable<StateNode[]>
    event: any
    datamodel: any;
    abstract id: string
    parent?: BaseInterpreter

    enterStates(enabledTransitions: List<TransitionNode>) {
        const statesToEnter = new OrderedSet<StateNode>()
        const statesForDefaultEntry = new OrderedSet<StateNode>()
        // initialize the temporary table for default content in history states
        const defaultHistoryContent = new HashTable<StateNode[]>()

        this.computeEntrySet(enabledTransitions, statesToEnter, statesForDefaultEntry, defaultHistoryContent)

        // todo: check this statically
        if (!hasLegalCompletion(statesToEnter.toList().list)) {
            throw new Error("Invalid transition target")
        }

        for (const s of statesToEnter.toList().sort(entryOrder)) {
            this.configuration.add(s)
            this.statesToInvoke.add(s)
            for (const content of s.onentry.sort(documentOrder)) {
                this.executeContent(content)
            }
            if (statesForDefaultEntry.isMember(s)) {
                // tslint:disable-next-line:no-non-null-assertion
                this.executeContent(s.initial!.transition.content)
            }
            if (defaultHistoryContent[s.id]) {
                this.executeContent(defaultHistoryContent[s.id])
            }
            if (isFinalState(s)) {
                if (isSCXMLElement(s.parent)) {
                    this.running = false
                }
                else {
                    const parent = s.parent
                    const grandparent = parent.parent

                    this.internalQueue.enqueue(new Event("done.state." + parent.id, s.donedata))

                    if (isParallelState(grandparent)) {
                        if (getChildStates(grandparent).every(this.isInFinalState, this)) {
                            this.internalQueue.enqueue(new Event("done.state." + grandparent.id))
                        }
                    }
                }
            }
        }
    }

    async mainEventLoop() {
        while (this.running) {
            let enabledTransitions: OrderedSet<TransitionNode> | null = null
            let macroStepDone = false

            // Here we handle eventless transitions and transitions
            // triggered by internal events until macrostep is complete
            while (this.running && !macroStepDone) {
                enabledTransitions = this.selectEventlessTransitions()
                if (enabledTransitions.isEmpty()) {
                    if (this.internalQueue.isEmpty()) {
                        macroStepDone = true
                    } else {
                        const internalEvent = this.internalQueue.dequeue()
                        this.event = internalEvent
                        enabledTransitions = this.selectTransitions(internalEvent)
                    }
                }
                if (!enabledTransitions.isEmpty()) {
                    this.microstep(enabledTransitions.toList())
                }

                // either we're in a final state, and we break out of the loop
                if (!this.running) {
                    break
                }

                // or we've completed a macrostep, so we start a new macrostep by waiting for an external event
                // Here we invoke whatever needs to be invoked. The implementation of 'invoke' is platform-specific
                for (const state of this.statesToInvoke.sort(documentOrder)) {
                    for (const inv of state.invoke.sort(entryOrder)) {
                        this.invoke(inv)
                    }
                }
                this.statesToInvoke.clear()
                // Invoking may have raised internal error events and we iterate to handle them
                if (!this.internalQueue.isEmpty()) {
                    continue
                }

                // A blocking wait for an external event.  Alternatively, if we have been invoked
                // our parent session also might cancel us.  The mechanism for this is platform specific,
                // but here we assume it’s a special event we receive
                const externalEvent = await this.externalQueue.dequeue()
                this.event = externalEvent

                if (isCancelEvent(externalEvent)) {
                    this.running = false
                    continue
                }
                for (const state of Array.from(this.configuration)) {
                    for (const inv of Array.from(state.invoke)) {
                        if (inv.invokeid === externalEvent.invokeid) {
                            this.applyFinalize(inv, externalEvent)
                        }
                        if (inv.autoforward) {
                            this.send(externalEvent, inv.id)
                        }
                    }
                }
                enabledTransitions = this.selectTransitions(externalEvent)
                if (!enabledTransitions.isEmpty()) {
                    this.microstep(enabledTransitions.toList())
                }
            }
        }
        // End of outer while running loop.  If we get here, we have reached a top-level final state or have been cancelled
        this.exitInterpreter()
    }

    abstract invoke(inv: any): void

    abstract applyFinalize(inv: InvokeNode, externalEvent: any): void

    abstract send(externalEvent: any, to?: string): void

    abstract executeContent(content: any): void

    private exitInterpreter() {
        const statesToExit = this.configuration.toList().sort(exitOrder)
        for (const s of statesToExit) {
            for (const content of s.onexit.sort(documentOrder)) {
                this.executeContent(content)
            }
            for (const inv of s.invoke) {
                this.cancelInvoke(inv)
            }
            this.configuration.delete(s)
            if (isFinalState(s) && isSCXMLElement(s.parent)) {
                this.returnDoneEvent(s.donedata)
            }
        }
    }

    protected constructor(private doc: StateDocument) {
        this.running = true
        this.configuration = new OrderedSet()
        this.statesToInvoke = new OrderedSet()
        this.internalQueue = new Queue()
        this.externalQueue = new BlockingQueue()
        this.historyValue = new HashTable()
    }

    start(datamodel: any = {}) {
        this.datamodel = datamodel
        this.enterStates(new List([this.doc.initial.transition]))
        void this.mainEventLoop()
    }

    private selectEventlessTransitions(): OrderedSet<TransitionNode> {
        let enabledTransitions = new OrderedSet<TransitionNode>()
        const atomicStates = this.configuration.toList().filter(isAtomicState).sort(documentOrder)
        for (const state of atomicStates) {
            loop: for (const s of new List([state]).append(getProperAncestors(state, null))) {
                for (const t of Array.from(s.transition.sort(documentOrder))) {
                    if (!t.event.length && conditionMatch(t, this.datamodel, this.event)) {
                        enabledTransitions.add(t)
                        break loop
                    }
                }
            }
        }
        enabledTransitions = this.removeConflictingTransitions(enabledTransitions)
        return enabledTransitions
    }

    private removeConflictingTransitions(enabledTransitions: OrderedSet<TransitionNode>): OrderedSet<TransitionNode> {
        const filteredTransitions = new OrderedSet<TransitionNode>()
        // toList sorts the transitions in the order of the states that selected them
        for (const t1 of Array.from(enabledTransitions.toList())) {
            let t1Preempted = false
            const transitionsToRemove = new OrderedSet<TransitionNode>()
            for (const t2 of Array.from(filteredTransitions.toList())) {
                if (this.computeExitSet(new List([t1])).hasIntersection(this.computeExitSet(new List([t2])))) {
                    if (isDescendant(t1.source, t2.source)) {
                        transitionsToRemove.add(t2)
                    }
                }
                else {
                    t1Preempted = true
                    break
                }
            }
            if (!t1Preempted) {
                for (const t3 of Array.from(transitionsToRemove.toList())) {
                    filteredTransitions.delete(t3)
                }
                filteredTransitions.add(t1)
            }
        }
        return filteredTransitions
    }

    private selectTransitions(event: any): OrderedSet<TransitionNode> {
        let enabledTransitions = new OrderedSet<TransitionNode>()
        const atomicStates = this.configuration.toList().filter(isAtomicState).sort(documentOrder)
        for (const state of atomicStates) {
            loop: for (const s of Array.from(new List([state]).append(getProperAncestors(state, null)))) {
                for (const t of Array.from(s.transition.sort(documentOrder))) {
                    if (t.event && nameMatch(t.event, event.name) && conditionMatch(t, this.datamodel, this.event)) {
                        enabledTransitions.add(t)
                        break loop
                    }
                }
            }
        }
        enabledTransitions = this.removeConflictingTransitions(enabledTransitions)
        return enabledTransitions
    }

    private microstep(enabledTransitions: List<TransitionNode>) {
        this.exitStates(enabledTransitions)
        this.executeTransitionContent(enabledTransitions)
        this.enterStates(enabledTransitions)
    }

    abstract cancelInvoke(inv: InvokeNode): void

    abstract returnDoneEvent(donedata: any): void

    private computeExitSet(transitions: List<TransitionNode>): OrderedSet<StateNode> {
        const statesToExit = new OrderedSet<StateNode>()
        for (const t of Array.from(transitions)) {
            if (t.target.length) {
                const domain = this.getTransitionDomain(t)
                for (const s of Array.from(this.configuration)) {
                    if (isDescendant(s, domain)) {
                        statesToExit.add(s)
                    }
                }
            }
        }
        return statesToExit
    }

    private executeTransitionContent(enabledTransitions: List<TransitionNode>) {
        for (const t of enabledTransitions) {
            this.executeContent(t.content)
        }
    }

    private exitStates(enabledTransitions: List<TransitionNode>) {
        let statesToExit: OrderedSet<StateNode> | StateNode[] = this.computeExitSet(enabledTransitions)
        for (const s of Array.from(statesToExit)) {
            this.statesToInvoke.delete(s)
        }
        statesToExit = statesToExit.toList().sort(exitOrder)
        for (const s of statesToExit) {
            for (const h of Array.from(s.history)) {
                let f
                if (h.type === "deep") {
                    f = (s0: any) => isAtomicState(s0) && isDescendant(s0,s)
                } else {
                    f = (s0: any) => s0.parent === s
                }
                this.historyValue[h.id] = this.configuration.toList().filter(f)
            }
        }
        for (const s of Array.from(statesToExit)) {
            for (const content of s.onexit.sort(documentOrder)) {
                this.executeContent(content)
            }
            for (const inv of Array.from(s.invoke)) {
                this.cancelInvoke(inv)
            }
            this.configuration.delete(s)
        }
    }

    private getTransitionDomain(t: TransitionNode): StateNode | null {
        const tstates = this.getEffectiveTargetStates(t)
        if (!tstates) {
            return null
        }
        else if (t.type === "internal" && isCompoundState(t.source) && tstates.every(s => isDescendant(s, t.source))) {
            return t.source
        }
        else {
            return this.findLCCA(new List([t.source]).append(tstates.toList()))
        }
    }

    private computeEntrySet(transitions: List<TransitionNode>, statesToEnter: OrderedSet<StateNode>, statesForDefaultEntry: OrderedSet<StateNode>, defaultHistoryContent: HashTable<StateNode[]>) {
        for (const t of Array.from(transitions)) {
            for (const s of t.target) {
                this.addDescendantStatesToEnter(s,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
            }
            const ancestor = this.getTransitionDomain(t)
            for (const s of Array.from(this.getEffectiveTargetStates(t))) {
                this.addAncestorStatesToEnter(s, ancestor, statesToEnter, statesForDefaultEntry, defaultHistoryContent)
            }
        }
    }

    private isInFinalState(s: StateNode): boolean {
        if (isCompoundState(s)) {
            return getChildStates(s).some(_s => isFinalState(_s) && this.configuration.isMember(_s))
        }
        else if (isParallelState(s)) {
            return getChildStates(s).every(this.isInFinalState, this)
        }
        else {
            return false
        }
    }

    private addDescendantStatesToEnter(state: StateNode, statesToEnter: OrderedSet<StateNode>, statesForDefaultEntry: OrderedSet<StateNode>, defaultHistoryContent: HashTable<StateNode[]>) {
        if (isHistoryState(state)) {
            if (this.historyValue[state.id]) {
                for (const s of this.historyValue[state.id]) {
                    this.addDescendantStatesToEnter(s,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
                }
                for (const s of this.historyValue[state.id]) {
                    this.addAncestorStatesToEnter(s, state.parent, statesToEnter, statesForDefaultEntry, defaultHistoryContent)
                }
            } else {
                const transition = state.transition.toList().head()
                defaultHistoryContent[state.parent.id] = transition.content
                for (const s of transition.target) {
                    this.addDescendantStatesToEnter(s,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
                }
                for (const s of transition.target) {
                    this.addAncestorStatesToEnter(s, state.parent, statesToEnter, statesForDefaultEntry, defaultHistoryContent)
                }
            }
        }
        else {
            statesToEnter.add(state)
            if (isCompoundState(state)) {
                statesForDefaultEntry.add(state)
                // tslint:disable-next-line:no-non-null-assertion
                for (const s of state.initial!.transition.target) {
                    this.addDescendantStatesToEnter(s,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
                }
                // tslint:disable-next-line:no-non-null-assertion
                for (const s of state.initial!.transition.target) {
                    this.addAncestorStatesToEnter(s, state, statesToEnter, statesForDefaultEntry, defaultHistoryContent)
                }
            }
            else {
                if (isParallelState(state)) {
                    for (const child of getChildStates(state)) {
                        if (!statesToEnter.some(s => isDescendant(s, child))) {
                            this.addDescendantStatesToEnter(child,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
                        }
                    }
                }
            }
        }
    }

    private addAncestorStatesToEnter(state: StateNode, ancestor: StateNode | null, statesToEnter: OrderedSet<StateNode>, statesForDefaultEntry: OrderedSet<StateNode>, defaultHistoryContent: HashTable<StateNode[]>) {
        for (const anc of Array.from(getProperAncestors(state, ancestor))) {
            statesToEnter.add(anc)
            if (isParallelState(anc)) {
                for (const child of getChildStates(anc)) {
                    if (!statesToEnter.some(s => isDescendant(s, child))) {
                        this.addDescendantStatesToEnter(child,statesToEnter,statesForDefaultEntry, defaultHistoryContent)
                    }
                }
            }
        }
    }

    private getEffectiveTargetStates(transition: TransitionNode): OrderedSet<StateNode> {
        const targets = new OrderedSet<StateNode>()
        for (const s of transition.target) {
            if (isHistoryState(s)) {
                if (this.historyValue[s.id]) {
                    targets.union(new OrderedSet(this.historyValue[s.id]))
                } else {
                    targets.union(this.getEffectiveTargetStates(s.transition.toList().head()))
                }
            } else {
                targets.add(s)
            }
        }
        return targets
    }

    private findLCCA(stateList: List<StateNode>) {
        const ancestors = getProperAncestors(stateList.head(), null).filter(isCompoundStateOrScxmlElement)
        for (const anc of ancestors) {
            if (stateList.tail().every(s => isDescendant(s, anc))) {
                return anc
            }
        }
        throw new Error(`Could not find LCCA`)
    }
}
