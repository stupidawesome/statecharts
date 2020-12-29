import { DocumentNode, HistoryStateNode, StateNode, TransitionNode } from "./interfaces"
import { isStateSchema } from "./schema"

export class List<T> {
    list: T[]
    [Symbol.iterator](): IterableIterator<T> {
        return this.list.values()
    }
    head() {
        return this.list[0]
    }
    tail() {
        return this.list.slice(1)
    }
    append(item: T[] | List<T>) {
        this.list.push(...Array.from(item))
        return this
    }
    filter(predicate: (value: T, index: number) => boolean): T[] {
        return this.list.filter(predicate)
    }
    some(predicate: (value: T, index: number) => boolean) {
        return this.list.some(predicate)
    }
    every(predicate: (value: T, index: number) => boolean) {
        return this.list.every(predicate)
    }
    sort(predicate: (a: T, b: T) => number): T[] {
        return this.list.slice().sort(predicate)
    }
    constructor(list: T[] = []) {
        this.list = list
    }
}

export class OrderedSet<T> {
    set: Set<T>
    [Symbol.iterator](): IterableIterator<T> {
        return this.set.values()
    }
    union(set: OrderedSet<T>) {
        Array.from(set.toList()).forEach((val) => {
            this.set.add(val)
        })
    }
    isMember(element: T) {
        return this.set.has(element)
    }
    add(item: T) {
        this.set.add(item)
    }
    delete(item: T) {
        this.set.delete(item)
    }
    clear() {
        this.set.clear()
    }
    some(predicate: (value: T, index: number) => boolean) {
        return Array.from(this.set.values()).some(predicate)
    }
    every(predicate: (value: T, index: number) => boolean) {
        return Array.from(this.set.values()).every(predicate)
    }
    hasIntersection(set: OrderedSet<T>) {
        return Array.from(this.set.values()).some((value) => set.isMember(value))
    }
    isEmpty() {
        return this.set.size === 0
    }
    toList(): List<T> {
        return new List(Array.from(this))
    }
    sort(predicate: (a: T, b: T) => number): OrderedSet<T> {
        const sorted = Array.from(this).sort(predicate)
        return new OrderedSet(sorted)
    }
    constructor(value?: T[]) {
        this.set = new Set(value)
    }
}

export class Queue {
    queue: any[]
    enqueue(item: any) {
        this.queue.push(item)
    }
    dequeue() {
        return this.queue.shift()
    }
    isEmpty() {
        return this.queue.length === 0
    }
    constructor() {
        this.queue = [] as any[]
    }
}

export class BlockingQueue {
    resolvers: ((value: any) => void)[]
    promises: Promise<any>[]

    enqueue(t: any) {
        if (!this.resolvers.length) {
            this.push();
        }
        const fn = this.resolvers.shift()
        if (fn) {
            fn(t)
        }
    }

    dequeue() {
        if (!this.promises.length) this.push();
        return this.promises.shift();
    }

    private push() {
        this.promises.push(
            new Promise(resolve => {
                this.resolvers.push(resolve);
            })
        );
    }

    constructor() {
        this.resolvers = [];
        this.promises = [];
    }
}

export class HashTable<T> {
    [key: string]: T
}

export function isAtomicState(state: StateNode): boolean {
    return state.descendants.length === 0
}

export function getProperAncestors(state1: StateNode, state2: StateNode | null): List<StateNode> {
    if (state2 === null) {
        return new List(state1.ancestors)
    }
    if (state2 === state1 || state2 === state1.parent || state1.descendants.includes(state2)) {
        return new List([])
    }
    return new List(state1.ancestors.slice(0, state1.ancestors.indexOf(state2)))
}

export function conditionMatch(transition: TransitionNode, datamodel: any, event: any): boolean {
    return transition.cond(event, datamodel)
}

export function isDescendant(state1: StateNode, state2: StateNode | null): boolean {
    return state2 !== null && state2.descendants.includes(state1)
}

export const CANCEL = {
    name: "__CANCEL__"
}

export function nameMatch(event: any[], name: string): boolean {
    return event.length === 0 || event.some(e => e === name || e === "*")
}

export function isParallelState(state: StateNode) {
    return state.mode === "parallel"
}

export function getChildStates(state: StateNode): StateNode[] {
    return state.children.filter(isStateSchema)
}

export function isFinalState(s: StateNode): boolean {
    return s.mode === "final"
}

export function isCompoundState(state: StateNode): boolean {
    return state.descendants.length > 0 && !isParallelState(state)
}

export function isHistoryState(state: any): state is HistoryStateNode {
    return state.mode === "history"
}

export function isCompoundStateOrScxmlElement(node: any): boolean {
    return isSCXMLElement(node) || isCompoundState(node)
}


export function isSCXMLElement(node: any): boolean {
    return node.parent === node
}

export function entryOrder(a: DocumentNode, b: DocumentNode) {
    if (a.documentDepth < b.documentDepth) {
        return -1
    }
    else if (a.documentDepth > b.documentDepth) {
        return 1
    }
    else {
        return documentOrder(a, b)
    }
}

export function exitOrder(a: DocumentNode, b: DocumentNode) {
    return entryOrder(a, b) * -1
}

export function documentOrder(a: DocumentNode, b: DocumentNode) {
    if (a.documentOrder < b.documentOrder) {
        return -1
    }
    else if (a.documentOrder > b.documentOrder) {
        return 1
    }
    else {
        return 0
    }
}

export function isCancelEvent(event: any): boolean {
    return event === CANCEL
}

export function hasLegalCompletion(states: any[]) {
    if (states.length < 2)
        return true;

    // iterate every pair
    for (const s1 of states) {
        NEXT_PAIR: for (const s2 of states) {
            if (s1 === s2)
                continue;

            let parent;

            // ok to be directly ancestorally related
            if (isDescendant(s1, s2) || isDescendant(s2, s1))
                continue;

            // find least common ancestor
            parent = s1.parent;
            while(parent) {
                if (isDescendant(s2, parent)) {
                    if (isParallelState(parent))
                        continue NEXT_PAIR;
                }
                parent = parent.parent === parent ? null : parent.parent;
            }

            return false;
        }
    }
    return true;
}
