import {
    DataModel,
    HistoryValue,
    InvokeRef,
    StateRef,
    TransitionRef,
} from "./models"
import { HistoryContent, ScxmlEvent, ScxmlSchema } from "./schemas"
import {
    BlockingQueue,
    conditionMatch,
    documentOrder,
    entryOrder,
    exitOrder,
    getChildStates,
    getProperAncestors,
    isAtomicState,
    isCancelEvent,
    isCompoundState,
    isCompoundStateOrScxmlElement,
    isDescendant,
    isFinalState,
    isHistoryState,
    isParallelState,
    isSCXMLElement,
    nameMatch,
    OrderedSet,
    Queue,
} from "./utils"
import { schemaToModel } from "./schema-to-model"

export abstract class BaseInterpreter<T extends { [key: string]: any } = any> {
    running = false
    historyValue: HistoryValue = {}
    configuration = new OrderedSet<StateRef>()
    statesToInvoke = new OrderedSet<StateRef>()
    internalQueue = new Queue()
    externalQueue = new BlockingQueue()
    context = {}
    invokes: { [key: string]: any } = {}
    datamodel: DataModel<T>
    parent?: BaseInterpreter
    binding: string

    constructor(schema: ScxmlSchema<T>, parent?: BaseInterpreter) {
        const doc = schemaToModel(schema)
        this.parent = parent
        this.running = true
        this.binding = doc.binding
        this.datamodel = doc.datamodel
        if (this.binding === "early") {
            this.datamodel.initialize()
        }
        this.enterStates([doc.initial.transition])
        void this.mainEventLoop()
    }

    isInFinalState(state: StateRef) {
        const { configuration } = this
        if (isCompoundState(state)) {
            return getChildStates(state).some(
                s => isFinalState(s) && configuration.has(s),
            )
        } else if (isParallelState(state)) {
            return getChildStates(state).every(this.isInFinalState, this)
        } else {
            return false
        }
    }

    addAncestorStatesToEnter(
        state: StateRef,
        parent: StateRef | null,
        statesToEnter: OrderedSet<StateRef>,
        statesForDefaultEntry: OrderedSet<StateRef>,
        defaultHistoryContent: HistoryContent,
    ) {
        for (const anc of getProperAncestors(state, parent)) {
            statesToEnter.add(anc)
            if (isParallelState(anc)) {
                for (const child of getChildStates(anc)) {
                    if (!statesToEnter.some(s => isDescendant(s, child))) {
                        this.addDescendantStatesToEnter(
                            child,
                            statesToEnter,
                            statesForDefaultEntry,
                            defaultHistoryContent,
                        )
                    }
                }
            }
        }
    }

    addDescendantStatesToEnter(
        state: StateRef,
        statesToEnter: OrderedSet<StateRef>,
        statesForDefaultEntry: OrderedSet<StateRef>,
        defaultHistoryContent: HistoryContent,
    ) {
        const { historyValue } = this
        if (isHistoryState(state)) {
            if (historyValue[state.id]) {
                for (const s of historyValue[state.id]) {
                    this.addDescendantStatesToEnter(
                        s,
                        statesToEnter,
                        statesForDefaultEntry,
                        defaultHistoryContent,
                    )
                    this.addAncestorStatesToEnter(
                        s,
                        state.parent,
                        statesToEnter,
                        statesForDefaultEntry,
                        defaultHistoryContent,
                    )
                }
            } else {
                defaultHistoryContent[
                    state.parent.id
                ] = state.transitions.reduce((a, t) => a.concat(t.commands), [])

                for (const s of state.transitions[0].target) {
                    this.addDescendantStatesToEnter(
                        s,
                        statesToEnter,
                        statesForDefaultEntry,
                        defaultHistoryContent,
                    )
                    if (state.parent) {
                        this.addAncestorStatesToEnter(
                            s,
                            state.parent,
                            statesToEnter,
                            statesForDefaultEntry,
                            defaultHistoryContent,
                        )
                    }
                }
            }
        } else {
            statesToEnter.add(state)
            if (isCompoundState(state)) {
                statesForDefaultEntry.add(state)
                for (const s of state.initial.transition.target) {
                    this.addDescendantStatesToEnter(
                        s,
                        statesToEnter,
                        statesForDefaultEntry,
                        defaultHistoryContent,
                    )
                    this.addAncestorStatesToEnter(
                        s,
                        state,
                        statesToEnter,
                        statesForDefaultEntry,
                        defaultHistoryContent,
                    )
                }
            } else {
                if (isParallelState(state)) {
                    for (const child of getChildStates(state)) {
                        if (!statesToEnter.some(s => isDescendant(s, child))) {
                            this.addDescendantStatesToEnter(
                                child,
                                statesToEnter,
                                statesForDefaultEntry,
                                defaultHistoryContent,
                            )
                        }
                    }
                }
            }
        }
    }

    findLCCA(stateList: StateRef[]) {
        for (const anc of getProperAncestors(stateList[0], null).filter(
            isCompoundStateOrScxmlElement,
        )) {
            if (stateList.slice(1).every(s => isDescendant(s, anc))) {
                return anc
            }
        }
    }

    getTransitionDomain(t: TransitionRef) {
        const tstates = this.getEffectiveTargetStates(t)
        if (!tstates) {
            return null
        } else if (
            t.source &&
            t.type === "internal" &&
            isCompoundState(t.source) &&
            tstates.every(s => isDescendant(s, t.source))
        ) {
            return t.source
        } else {
            return this.findLCCA([t.source].concat(tstates.toList()))
        }
    }

    computeEntrySet(
        enabledTransitions: TransitionRef[],
        statesToEnter: OrderedSet<StateRef>,
        statesForDefaultEntry: OrderedSet<StateRef>,
        defaultHistoryContent: HistoryContent,
    ) {
        for (const t of enabledTransitions) {
            for (const s of t.target) {
                this.addDescendantStatesToEnter(
                    s,
                    statesToEnter,
                    statesForDefaultEntry,
                    defaultHistoryContent,
                )
            }
            const ancestor = this.getTransitionDomain(t)
            for (const s of this.getEffectiveTargetStates(t)) {
                this.addAncestorStatesToEnter(
                    s,
                    ancestor,
                    statesToEnter,
                    statesForDefaultEntry,
                    defaultHistoryContent,
                )
            }
        }
    }

    getEffectiveTargetStates(transition: TransitionRef) {
        const { historyValue } = this
        const targets = new OrderedSet<StateRef>()
        for (const s of transition.target) {
            if (isHistoryState(s)) {
                if (historyValue[s.id]) {
                    targets.union(historyValue[s.id])
                } else {
                    for (const t of s.transitions) {
                        targets.union(this.getEffectiveTargetStates(t))
                    }
                }
            } else {
                targets.add(s)
            }
        }
        return targets
    }

    removeConflictingTransitions(
        enabledTransitions: OrderedSet<TransitionRef>,
    ) {
        const filteredTransitions = new OrderedSet<TransitionRef>()
        //toList sorts the transitions in the order of the states that selected them
        for (const t1 of enabledTransitions.toList()) {
            let t1Preempted = false
            const transitionsToRemove = new OrderedSet<TransitionRef>()
            for (const t2 of filteredTransitions.toList()) {
                if (
                    this.computeExitSet([t1]).hasIntersection(
                        this.computeExitSet([t2]),
                    )
                ) {
                    if (t1.source && isDescendant(t1.source, t2.source)) {
                        transitionsToRemove.add(t2)
                    } else {
                        t1Preempted = true
                        break
                    }
                }
            }
            if (!t1Preempted) {
                for (const t3 of transitionsToRemove.toList()) {
                    filteredTransitions.delete(t3)
                }
                filteredTransitions.add(t1)
            }
        }
        return filteredTransitions
    }

    computeExitSet(transitions: TransitionRef[]) {
        const { configuration } = this
        const statesToExit = new OrderedSet<StateRef>()
        for (const t of transitions) {
            if (t.target.length > 0) {
                const domain = this.getTransitionDomain(t)
                for (const s of configuration) {
                    if (isDescendant(s, domain)) {
                        statesToExit.add(s)
                    }
                }
            }
        }
        return statesToExit
    }

    selectEventlessTransitions() {
        const { configuration, context } = this
        const enabledTransitions = new OrderedSet<TransitionRef>()
        const atomicStates = configuration
            .toList()
            .filter(isAtomicState)
            .sort(documentOrder)

        for (const state of atomicStates) {
            loop: for (const s of [state].concat(
                getProperAncestors(state, null),
            )) {
                for (const t of s.transitions.slice().sort(documentOrder)) {
                    if (!t.event && conditionMatch(t, context)) {
                        enabledTransitions.add(t)
                        break loop
                    }
                }
            }
        }

        return this.removeConflictingTransitions(enabledTransitions)
    }

    selectTransitions(event: { name: string }) {
        const { configuration, context } = this
        const enabledTransitions = new OrderedSet<TransitionRef>()
        const atomicStates = configuration
            .toList()
            .filter(isAtomicState)
            .sort(documentOrder)

        for (const state of atomicStates) {
            loop: for (const s of [state].concat(
                getProperAncestors(state, null),
            )) {
                for (const t of s.transitions.slice().sort(documentOrder)) {
                    if (
                        t.event &&
                        nameMatch(t.event, event.name) &&
                        conditionMatch(t, context)
                    ) {
                        enabledTransitions.add(t)
                        break loop
                    }
                }
            }
        }

        return this.removeConflictingTransitions(enabledTransitions)
    }

    microstep(enabledTransitions: TransitionRef[]) {
        this.exitStates(enabledTransitions)
        this.executeTransitionContent(enabledTransitions)
        this.enterStates(enabledTransitions)
    }

    exitStates(enabledTransitions: TransitionRef[]) {
        const { configuration, statesToInvoke, historyValue } = this
        const statesToExit = this.computeExitSet(enabledTransitions)
        for (const s of statesToExit) {
            statesToInvoke.delete(s)
        }
        const listOfStatesToExit = statesToExit.toList().sort(exitOrder)
        for (const s of listOfStatesToExit) {
            for (const h of s.history) {
                const f =
                    h.def.type === "deep"
                        ? (s0: any) => isAtomicState(s0) && isDescendant(s0, s)
                        : (s0: any) => s0.parent === s

                historyValue[h.def.id] = configuration.toList().filter(f)
            }
            for (const _s of listOfStatesToExit) {
                this.executeContent(_s.onexit)
                for (const inv of _s.invoke) {
                    this.cancelInvoke(inv)
                }
                configuration.delete(_s)
            }
        }
    }

    executeTransitionContent(enabledTransitions: TransitionRef[]) {
        for (const t of enabledTransitions) {
            this.executeContent(t)
        }
    }

    async mainEventLoop() {
        const {
            datamodel,
            internalQueue,
            externalQueue,
            configuration,
            statesToInvoke,
        } = this
        while (this.running) {
            let enabledTransitions = null
            let macrostepDone = false

            while (this.running && !macrostepDone) {
                enabledTransitions = this.selectEventlessTransitions()
                if (enabledTransitions.isEmpty()) {
                    if (internalQueue.isEmpty()) {
                        macrostepDone = true
                    } else {
                        const internalEvent = internalQueue.dequeue()
                        datamodel["_event"] = internalEvent
                        enabledTransitions = this.selectTransitions(
                            internalEvent,
                        )
                    }
                }
                if (!enabledTransitions.isEmpty()) {
                    this.microstep(enabledTransitions.toList())
                }
            }
            console.log(
                "current state:",
                configuration
                    .toList()
                    .sort(exitOrder)
                    .map(s => s.id)
                    .filter(Boolean)
                    .join(", "),
            )

            // either we're in a final state, and we break out of the loop
            if (!this.running) {
                break
            }
            // or we've completed a macrostep, so we start a new macrostep by waiting for an external event
            // Here we invoke whatever needs to be invoked. The implementation of 'invoke' is platform-specific
            for (const state of statesToInvoke.toList().sort(entryOrder)) {
                for (const inv of state.invoke.sort(documentOrder)) {
                    this.invoke(inv)
                }
            }
            statesToInvoke.clear()
            // Invoking may have raised internal error events and we iterate to handle them
            if (!internalQueue.isEmpty()) {
                continue
            }
            // A blocking wait for an external event. Alternatively, if we have been invoked
            // our parent session also might cancel us. The mechanism for this is platform specific,
            // but here we assume it’s a special event we receive
            const externalEvent: ScxmlEvent = await externalQueue.dequeue()
            if (isCancelEvent(externalEvent)) {
                this.running = false
                continue
            }
            datamodel._event = externalEvent
            for (const state of configuration) {
                for (const inv of state.invoke) {
                    if (inv.id === externalEvent.invokeid) {
                        this.applyFinalize(inv, externalEvent)
                    }
                    if (inv.autoforward || inv.id === externalEvent.target) {
                        this.send(externalEvent, inv.id)
                    }
                }
            }
            enabledTransitions = this.selectTransitions(externalEvent)
            if (!enabledTransitions.isEmpty()) {
                this.microstep(enabledTransitions.toList())
            }
            // this.tick.next(this.datamodel)
        }
        // End of outer while running loop. If we get here, we have reached a top-level final state or have been cancelled
        this.exitInterpreter()
    }

    exitInterpreter() {
        const { configuration } = this
        console.log(
            "final state:",
            configuration
                .toList()
                .sort(exitOrder)
                .filter(Boolean)
                .map(s => s.id)
                .join(", "),
        )
        const statesToExit = configuration.toList().sort(exitOrder)
        for (const s of statesToExit) {
            this.executeContent(s.onexit)
            for (const inv of s.invoke) {
                this.cancelInvoke(inv)
            }
            configuration.delete(s)
            if (isFinalState(s) && isSCXMLElement(s.parent)) {
                this.returnDoneEvent(s.donedata)
            }
        }
    }

    enterStates(enabledTransitions: TransitionRef[]) {
        const { configuration, statesToInvoke } = this
        const statesToEnter = new OrderedSet<StateRef>()
        const statesForDefaultEntry = new OrderedSet<StateRef>()
        const defaultHistoryContent: HistoryContent = {}

        this.computeEntrySet(
            enabledTransitions,
            statesToEnter,
            statesForDefaultEntry,
            defaultHistoryContent,
        )

        for (const s of statesToEnter.toList().sort(entryOrder)) {
            configuration.add(s)
            statesToInvoke.add(s)
            if (this.binding === "late" && s.firstEntry) {
                this.datamodel.initialize()
                s.firstEntry = false
            }
            this.executeContent(s.onentry)
            if (statesForDefaultEntry.has(s)) {
                this.executeContent(s.initial.transition)
            }
            if (isFinalState(s)) {
                if (isSCXMLElement(s.parent)) {
                    this.running = false
                } else {
                    const parent = s.parent
                    if (parent) {
                        const grandparent = parent.parent
                        const event: ScxmlEvent = {
                            ...s.donedata,
                            name: "done.state." + parent.id,
                        }
                        this.internalQueue.enqueue(event)
                        if (grandparent && isParallelState(grandparent)) {
                            if (
                                getChildStates(grandparent).every(
                                    this.isInFinalState,
                                    this,
                                )
                            ) {
                                this.internalQueue.enqueue(
                                    new Event("done.state." + grandparent.id),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    abstract invoke(inv: InvokeRef)

    abstract executeContent(content: any)

    abstract cancelInvoke(inv: any)

    abstract returnDoneEvent(donedata: any)

    abstract send(event: any, target?: string)

    abstract applyFinalize(inv: any, externalEvent: any)
}
