import { StateMode } from "./schema"
import { OrderedSet } from "./utils"

export interface StateDocument {
    initial: {
        transition: TransitionNode
    }
}

export interface TransitionNode extends DocumentNode {
    event: string[];
    type: "internal" | "external"
    source: StateNode;
    target: (StateNode)[];
    content: any;
    cond(event: any, state: any): boolean;
}

// tslint:disable-next-line:no-empty-interface
export interface EntryNode extends DocumentNode {}
// tslint:disable-next-line:no-empty-interface
export interface ExitNode extends DocumentNode {}

export type StateChildren = Array<StateNode | TransitionNode | InvokeNode>

export interface StateNode extends DocumentNode {
    ancestors: StateNode[];
    children: StateChildren;
    descendants: (StateNode)[];
    transition: OrderedSet<TransitionNode>;
    initial: null | {
        transition: TransitionNode
    };
    mode: StateMode
    id: string;
    history: OrderedSet<HistoryStateNode>;
    donedata: any;
    parent: StateNode
    onentry: OrderedSet<EntryNode>;
    onexit: OrderedSet<ExitNode>;
    invoke: OrderedSet<InvokeNode>
}

export interface HistoryStateNode extends DocumentNode, StateNode {
    id: string
    mode: "history"
    type: "deep" | "shallow"
}

export interface InvokeNode extends DocumentNode {
    id: string;
    autoforward: boolean;
    invokeid: string;
    src: any
    content: any[]
}

export interface DocumentNode {
    documentDepth: number
    documentOrder: number
}
