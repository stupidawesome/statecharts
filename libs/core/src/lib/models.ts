import {
    AssignSchema,
    FinalSchema,
    HistorySchema,
    InvokeSchema,
    OnEntrySchema,
    OnExitSchema,
    ParallelSchema,
    RaiseSchema,
    ScriptSchema,
    ScxmlEvent,
    ScxmlNode,
    ScxmlSchema,
    SendSchema,
    StateMode,
    StateSchema,
    TransitionSchema,
} from "./schemas"

export class TransitionRef implements ScxmlNode, ExecutableRef {
    def: TransitionSchema<any>
    source: StateRef
    depth: number
    documentOrder: number
    event: string[]
    target: StateRef[]
    cond?: string | Function
    type: "internal" | "external"
    commands: CommandRef[]
}

export class InvokeRef implements ScxmlNode {
    def: InvokeSchema
    id: string
    src: string | ScxmlSchema
    autoforward?: boolean
    depth: number
    documentOrder: number
    type: string
}

export class HistoryRef {
    def: HistorySchema
    // transition: {
    //     target: StateRef[]
    // }
}

export class StateRef implements ScxmlNode {
    id: string
    def:
        | StateSchema
        | ParallelSchema
        | HistorySchema
        | FinalSchema
        | ScxmlSchema
    mode: StateMode
    depth: number
    datamodel: DataModel<any>
    documentOrder: number
    transitions: TransitionRef[]
    parent: StateRef | ScxmlRef<any>
    ancestors: StateRef[]
    descendants: StateRef[]
    onentry: OnEntryRef
    onexit: OnExitRef
    invoke: InvokeRef[]
    atomic: boolean
    donedata: any
    firstEntry: boolean
    history: HistoryRef[]
    initial: {
        transition: TransitionRef
    }
}

export class ScxmlRef<T extends { [key: string]: any }> extends StateRef {
    id: string | null
    binding: "early" | "late"
    depth: number
    documentOrder: number
    states: StateRef[]
    stateMap: StateMap
    def: ScxmlSchema
    datamodel: DataModel<T>
}

export class OnEntryRef implements ExecutableRef {
    def: OnEntrySchema<any>
    commands: (CommandRef | SendRef | RaiseRef | ScriptRef)[]
}

export class OnExitRef implements ExecutableRef {
    def: OnExitSchema<any>
    commands: (CommandRef | SendRef | RaiseRef | ScriptRef)[]
}

export class CommandRef implements ScxmlNode {
    def: AssignSchema<any> | SendSchema | RaiseSchema | ScriptSchema
    depth: number
    documentOrder: number
}

export class SendRef implements ScxmlNode {
    def: SendSchema
    depth: number
    documentOrder: number
}

export class RaiseRef implements ScxmlNode {
    def: RaiseSchema
    depth: number
    documentOrder: number
}

export class ScriptRef implements ScxmlNode {
    def: ScriptSchema
    depth: number
    documentOrder: number
}

export abstract class ExecutableRef {
    commands: (CommandRef | SendRef | RaiseRef | ScriptRef)[]
}

export class DataModel<T extends { [key: string]: any }> {
    _event: ScxmlEvent
    data: T
    schema: StateSchema | ParallelSchema | ScxmlSchema
    constructor(
        schema: StateSchema | ParallelSchema | ScxmlSchema,
        data: T = {} as T,
    ) {
        this.data = data
        this.schema = schema
    }
    initialize() {
        if (this.schema.datamodel) {
            for (const data of this.schema.datamodel) {
                this.data[data.id as keyof T] = data.expr
            }
        }
    }
}

export interface HistoryValue {
    [key: string]: StateRef[]
}

export interface StateMap {
    [key: string]: StateRef
}

export interface TransitionMap {
    [key: string]: TransitionRef
}
