import {
    DataSchema, FinalSchema,
    HistorySchema,
    InvokeSchema,
    OnEntrySchema,
    OnExitSchema,
    ParallelSchema, ScxmlSchema, StateSchema,
    TransitionSchema
} from "./schemas";

export function model<T extends any>(data: T): DataSchema<T>[] {
    return Object.entries(data).map(([id, expr]) => ({
        id,
        expr
    })) as DataSchema<T>[];
}

export function datamodel(data) {
    return {
        type: "datamodel",
        schema: model(data)
    };
}

export function schema<TData>(elements: any[]) {
    const _schema: ScxmlSchema = {
        state: []
    };

    for (const element of elements) {
        switch (element.type) {
            case "initial": {
                _schema.initial = _schema.initial
                    ? _schema.initial.concat(element.schema.id)
                    : element.schema.id;
                break;
            }
            case "state": {
                _schema.state.push(element.schema);
                break;
            }
            case "datamodel": {
                _schema.datamodel = element.schema;
            }
        }
    }

    return _schema;
}

export function parallel(id: string, children?: any[]) {
    return state(id, children, { mode: "parallel" });
}

export function final(id: string, children?: any[]) {
    return state(id, children, { mode: "final" });
}

export function history(id: string, children?: any[]) {
    return state(id, children, { mode: "history" });
}

export function initial(id: string | string[]) {
    return {
        type: "initial",
        schema: {
            id: Array.isArray(id) ? id : [id]
        }
    };
}

export function state(
    id: string,
    children: any[] = [],
    opts: { mode?: string } = {}
) {
    const _schema: StateSchema | ParallelSchema | HistorySchema | FinalSchema = {
        id
    };
    if (opts.mode) {
        (<any>_schema).mode = opts.mode as any;
    }
    const _initial: { schema: { id: string[] } }[] = children.filter(
        child => child.type === "initial"
    );
    const _state: { schema: StateSchema }[] = children.filter(
        child => child.type === "state"
    );
    const _transition: { schema: TransitionSchema<any> }[] = children.filter(
        child => child.type === "transition"
    );
    const onentry: { schema: OnEntrySchema<any> }[] = children.filter(
        child => child.type === "onentry"
    );
    const onexit: { schema: OnExitSchema<any> }[] = children.filter(
        child => child.type === "onexit"
    );
    const _invoke: { schema: InvokeSchema }[] = children.filter(
        child => child.type === "invoke"
    );

    if (_state.length) {
        (<StateSchema>_schema).state = _state.map(s => s.schema);
    }
    if (_initial.length) {
        (<StateSchema>_schema).initial = _initial.reduce(
            (acc, next) => acc.concat(next.schema.id),
            []
        );
    }
    if (_transition.length) {
        (<StateSchema>_schema).transition = _transition.map(s => s.schema);
    }
    if (onentry.length) {
        (<StateSchema>_schema).onentry = onentry.reduce(
            (acc, next) => acc.concat(next.schema),
            []
        ) as any;
    }
    if (onexit.length) {
        (<StateSchema>_schema).onexit = onexit.reduce(
            (acc, next) => acc.concat(next.schema),
            []
        ) as any;
    }
    if (_invoke.length) {
        (<StateSchema>_schema).invoke = _invoke.map(s => s.schema);
    }

    return {
        type: "state",
        schema: _schema
    };
}

export function transition(
    target: string | string[],
    opts: { type?: "internal" | "external" } = {}
) {
    const _schema: TransitionSchema<any> = {
        target: Array.isArray(target) ? target : [target],
        type: opts.type
    };

    return {
        type: "transition",
        schema: _schema
    };
}

export function enter(commands: any[]) {
    return {
        type: "onentry",
        schema: commands
    };
}

export function leave(commands: any[]) {
    return {
        type: "onexit",
        schema: commands
    };
}

export function trigger(
    event: string | string[] | Function,
    cond?: Function | any[],
    children: any[] = []
) {
    const iter = Array.isArray(cond) ? cond : children;
    const _transition = iter.find(item => item.type === "transition") || {
        schema: {}
    };
    const _schema: TransitionSchema<any> = {
        event:
            typeof event === "string"
                ? Array.isArray(event)
                ? event
                : [event]
                : undefined,
        cond:
            typeof event === "function"
                ? event
                : typeof cond === "function"
                ? cond
                : undefined,
        target: _transition ? (_transition.schema.target as string[]) : undefined,
        type: _transition ? _transition.schema.type : undefined,
        command: iter.filter(item => item.type !== "transition")
    };

    return {
        type: "transition",
        schema: _schema
    };
}

export function invoke(id: string, src: any, autoforward?: boolean) {
    const _schema: InvokeSchema = {
        id,
        src,
        autoforward
    };

    return {
        type: "invoke",
        schema: _schema
    };
}
