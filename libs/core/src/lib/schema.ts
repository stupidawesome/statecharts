import {
    EntryNode,
    ExitNode,
    HistoryStateNode,
    InvokeNode,
    StateChildren,
    StateNode,
    TransitionNode,
} from "./interfaces"
import { OrderedSet } from "./utils"

export type RootMetadata = Array<StateSchema>

export type StateMetadata = Array<StateSchema | TransitionSchema | InvokeSchema>

export class StateSchema implements StateNode {
    ancestors: StateNode[];
    descendants: (StateNode | HistoryStateNode)[];
    documentDepth: number;
    documentOrder: number;
    donedata: any;
    history: OrderedSet<HistoryStateNode>;
    invoke: OrderedSet<InvokeNode>;
    onentry: OrderedSet<EntryNode>;
    onexit: OrderedSet<ExitNode>;
    parent!: StateNode;
    transition: OrderedSet<TransitionNode>;
    initial: { transition: TransitionNode } | null;

    constructor(public id: string, public children: StateMetadata, public mode: StateMode, public type: any) {
        this.ancestors = [];
        this.descendants = [];
        this.documentDepth = 0
        this.documentOrder = 0
        this.donedata = {};
        this.history = new OrderedSet<HistoryStateNode>();
        this.invoke = new OrderedSet<InvokeNode>();
        this.onentry = new OrderedSet<EntryNode>();
        this.onexit = new OrderedSet<ExitNode>();
        this.transition = new OrderedSet<TransitionNode>();
        this.initial = null

        const states = children.filter(isStateSchema) as StateNode[]

        for (const s of states) {
            this.descendants.push(s, ...s.descendants)
        }
        for (const t of children.filter((i): i is TransitionSchema => i instanceof TransitionSchema)) {
            this.transition.add(t)
        }
        for (const s of children.filter((i): i is StateSchema => i instanceof StateSchema)) {
            this.history.add(s as any)
        }
        for (const inv of children.filter((i): i is InvokeSchema => i instanceof InvokeSchema)) {
            this.invoke.add(inv)
        }
    }
}

export function isStateSchema(s: any): s is StateSchema {
    return s instanceof StateSchema
}

export type StateMode = "default" | "parallel" | "history" | "final"

export function state(id: string, children: StateMetadata = [], initial?: boolean) {
    return new StateSchema(id, children, "default", initial ? "initial" : null)
}

export function parallel(id: string, children: StateMetadata, initial?: boolean) {
    return new StateSchema(id, children, "parallel", initial ? "initial" : null)
}

export function final(id: string, children: StateMetadata = []) {
    return new StateSchema(id, children, "final", null)
}

export function history(id: string, children: StateMetadata = [], deep = false) {
    return new StateSchema(id, children, "history", deep ? "deep" : "shallow")
}

history.deep = function(id: string, children: StateMetadata = []) {
    return history(id, children, true)
}

export function trueCond() {
    return true
}

export const target = Symbol("target")

export class TransitionSchema implements TransitionNode {
    content: any[];
    documentDepth: number;
    documentOrder: number;
    source!: StateNode;
    target: StateNode[];
    cond: (event: any, state: any) => boolean

    [target]: string[]

    to(...targets: string[]) {
        this[target] = targets
        return this
    }

    when(predicate: (event: any, state: any) => boolean) {
        this.cond = predicate
        return this
    }

    action(...content: any[]) {
        this.content = content
        return this
    }

    constructor(public event: string[], public type: "internal" | "external") {
        this.target = []
        this[target] = []
        this.content = []
        this.cond = trueCond
        this.documentDepth = 0
        this.documentOrder = 0
    }
}

export function transition(...event: string[]): TransitionSchema {
    const type = event.length === 0 ? "internal" : "external"
    return new TransitionSchema(event, type)
}

transition.done = function(invokeId: string) {
    return transition(`done.invoke.${invokeId}`)
}

let uid = 0

export class InvokeSchema implements InvokeNode {
    autoforward: boolean
    documentDepth: number
    documentOrder: number
    invokeid: string
    doneTransition?: TransitionSchema
    content: any[]

    source(src: any) {
        this.src = src
        return this
    }

    forwardTo(src: any) {
        this.src = src
        this.autoforward = true
        return this
    }

    finalize(...content: ContentSchema[]) {
        this.content = content
        return this
    }

    constructor(public id: string, public src: any) {
        this.autoforward = false
        this.documentDepth = 0
        this.documentOrder = 0
        this.invokeid = id
        this.content = []
    }
}

export function genId() {
    return (uid++).toString()
}

export function invoke(id: string, service?: any) {
    return new InvokeSchema(id, service)
}

export class ContentSchema {
    constructor(public type: string, public payload: any) {}
}

export function send(event: any) {
    return new ContentSchema("send", event)
}

export function raise(event: string) {
    return new ContentSchema("raise", { name: event })
}

export function assign(...reducers: ((datamodel: any, event: any) => any)[]) {
    return new ContentSchema("assign", reducers)
}

export function log(message?: string) {
    return new ContentSchema("log", message)
}

let order = 0

export function expandSchema(metadata: StateMetadata, parent: StateNode, states: Map<string, StateNode>, transitions: Set<TransitionSchema>) {
    let initial = metadata.filter(isStateSchema)[0]
    for (const element of metadata) {
        element.documentDepth = parent.documentDepth + 1
        element.documentOrder = order++

        if (element instanceof StateSchema) {
            element.parent = parent
            element.ancestors.push(parent, ...parent.ancestors)
            states.set(element.id, element as StateNode)

            if (element.initial) {
                initial = element
            }

            if (element.children.length) {
                expandSchema(element.children, element as StateNode, states, transitions)
            }
        }
        if (element instanceof TransitionSchema) {
            element.source = parent
            transitions.add(element)
        }
    }

    if (parent.descendants.length) {
        parent.initial = {
            transition: {
                target: [initial],
                source: parent
            } as any
        }
    }
}
