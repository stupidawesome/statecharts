import {
    CommandRef,
    DataModel, ExecutableRef,
    HistoryRef, InvokeRef,
    OnEntryRef,
    OnExitRef,
    ScxmlRef,
    StateMap,
    StateRef,
    TransitionRef
} from "./models";
import {
    ExecutableSchema, FinalSchema,
    HistorySchema, InvokeSchema,
    OnEntrySchema, OnExitSchema, ParallelSchema,
    ScxmlSchema,
    StateMode,
    StateSchema,
    TransitionSchema
} from "./schemas";
import {isCompoundState} from "./utils";

export function schemaToModel<T extends { [key: string]: any }>(
    schema: ScxmlSchema<T>
): ScxmlRef<T> {
    const ref = new ScxmlRef<T>();

    ref.id = null;
    ref.binding = schema.binding || "early";
    ref.depth = -1;
    ref.documentOrder = 0;
    ref.states = [];
    ref.stateMap = {};
    ref.descendants = [];
    ref.ancestors = [];
    ref.transitions = [];
    ref.invoke = [];
    ref.history = [];
    ref.def = schema;
    ref.parent = null;
    ref.datamodel = new DataModel(schema);

    if (schema.state) {
        schema.state
            .map((stateSchema, index) => toStateRef(stateSchema, 0, index, ref))
            .forEach(state =>
                collectStates([state, ...state.descendants], ref.states, ref.stateMap)
            );
    }

    const transition = new TransitionRef();

    transition.source = ref;
    transition.depth = ref.depth;
    transition.documentOrder = -1;
    transition.def = {
        target: ref.def.initial
    };
    transition.target =
        schema.initial && schema.initial.length
            ? schema.initial.map(id => ref.stateMap[id])
            : [ref.stateMap[schema.state[0].id]];

    ref.initial = {
        transition
    };

    ref.states.forEach(stateRef => {
        ref.descendants.push(stateRef);
        if (isCompoundState(stateRef)) {
            const def = stateRef.def as StateSchema;
            const _transition = new TransitionRef();
            _transition.source = stateRef;
            _transition.depth = stateRef.depth;
            _transition.documentOrder = -1;
            _transition.def = {
                target: def.initial
            };
            _transition.target =
                def.initial && def.initial.length
                    ? def.initial.map(id => ref.stateMap[id])
                    : [ref.stateMap[def.state[0].id]];

            // todo: allow initial element to contain a transition with executable content
            addExecutableContent([], _transition, stateRef.depth + 1);

            stateRef.initial = {
                transition: _transition
            };
        }
        addTransitions(stateRef.def, stateRef, ref.stateMap);
    });

    return ref;
}



export function collectStates(
    stateList: StateRef[],
    list: StateRef[],
    map: StateMap
) {
    stateList.forEach(state => {
        list.push(state);
        map[state.id] = state;
    });
}


function addToParents(ref: StateRef, descendant: StateRef) {
    if (ref.parent) {
        ref.parent.descendants.push(descendant);
        addToParents(ref.parent, descendant);
    }
}

export function addDescendants(
    schemas: (StateSchema | ParallelSchema)[] | undefined,
    ref: StateRef
) {
    if (schemas) {
        schemas.forEach((value, documentOrder) => {
            const descendant = toStateRef(value, ref.depth + 1, documentOrder, ref);
            ref.descendants.unshift(descendant);
            addToParents(ref, descendant);
        });
    }
}

export function addExecutableContent(
    schema: ExecutableSchema<any> | undefined,
    executableRef: ExecutableRef,
    depth: number
) {
    executableRef.commands = [];

    if (!schema) {
        return;
    }
    schema.forEach((value, index) => {
        const ref = new CommandRef();
        ref.def = value;
        ref.depth = depth;
        ref.documentOrder = index;
        executableRef.commands.push(ref);
    });
}

export function toTransitionRef(
    schema: TransitionSchema<any>,
    documentOrder: number,
    stateRef: StateRef,
    map: StateMap
) {
    const ref = new TransitionRef();

    ref.depth = stateRef.depth + 1;
    ref.documentOrder = documentOrder;
    ref.target = [];
    ref.event = schema.event;
    ref.type = schema.type || "external";
    ref.cond = schema.cond;
    ref.def = schema;
    ref.source = stateRef;

    addExecutableContent(schema.command, ref, ref.depth + 1);

    if (schema.target) {
        schema.target
            .map(value => map[value])
            .filter(Boolean)
            .forEach(target => ref.target.push(target));
    }

    return ref;
}

export function hasTransitions(
    value: any
): value is StateSchema | ParallelSchema {
    return value.hasOwnProperty("transition");
}

export function addTransitions(
    schema: StateSchema | ParallelSchema | HistorySchema | ScxmlSchema,
    stateRef: StateRef,
    map: StateMap
) {
    if (hasMode(schema) && schema.mode === "history") {
        const historyRef = new HistoryRef();
        historyRef.def = schema;
        stateRef.parent.history.push(historyRef);
    } else if (hasTransitions(schema)) {
        schema.transition.forEach((value, index) => {
            stateRef.transitions.push(toTransitionRef(value, index, stateRef, map));
        });
    }
}

export function hasMode(
    value: any
): value is ParallelSchema | FinalSchema | HistorySchema {
    return value.hasOwnProperty("mode");
}

export function toInvokeRef(
    schema: InvokeSchema,
    depth: number,
    documentOrder: number
) {
    const ref = new InvokeRef();

    ref.def = schema;
    ref.id = schema.id;
    ref.src = schema.src;
    ref.autoforward = schema.autoforward || false;
    ref.depth = depth;
    ref.documentOrder = documentOrder;

    return ref;
}

export function addInvokes(schema: InvokeSchema[] | undefined, ref: StateRef) {
    if (schema) {
        schema.forEach((value, index) =>
            ref.invoke.push(toInvokeRef(value, ref.depth + 1, index))
        );
    }
}

export function toOnEntryRef(
    schema: OnEntrySchema<any> | undefined,
    depth: number
) {
    const ref = new OnEntryRef();
    ref.def = schema;
    addExecutableContent(schema, ref, depth);
    return ref;
}

export function toOnExitRef(
    schema: OnExitSchema<any> | undefined,
    depth: number
) {
    const ref = new OnExitRef();
    ref.def = schema;
    addExecutableContent(schema, ref, depth);
    return ref;
}

export function toStateRef(
    schema: StateSchema | ParallelSchema | FinalSchema | HistorySchema,
    depth: number,
    documentOrder: number,
    parent: StateRef | ScxmlRef<any>
) {
    const ref = new StateRef();

    ref.id = schema.id;
    ref.def = schema;
    ref.depth = depth;
    ref.documentOrder = documentOrder;
    ref.parent = parent;
    ref.ancestors = parent ? [parent].concat(parent.ancestors) : [parent];
    ref.descendants = [];
    ref.transitions = [];
    ref.invoke = [];
    ref.history = [];
    ref.datamodel = parent.datamodel;

    if (hasMode(schema)) {
        switch (schema.mode) {
            case "parallel": {
                addDescendants(schema.state, ref);
                addInvokes(schema.invoke, ref);
                ref.datamodel = new DataModel(schema, parent.datamodel.data);
                ref.onentry = toOnEntryRef(schema.onentry, ref.depth + 1);
                ref.onexit = toOnExitRef(schema.onexit, ref.depth + 1);
                ref.mode = StateMode.parallel;
                ref.atomic = ref.descendants.length === 0;
                break;
            }
            case "history": {
                ref.mode = StateMode.history;
                ref.atomic = true;
                ref.descendants = [];
                break;
            }
            case "final": {
                ref.mode = StateMode.final;
                ref.atomic = true;
                ref.descendants = [];
                ref.donedata = schema.donedata;
                break;
            }
        }
    } else {
        addDescendants(schema.state, ref);
        addInvokes(schema.invoke, ref);
        ref.datamodel = new DataModel(schema, parent.datamodel.data);
        ref.onentry = toOnEntryRef(schema.onentry, ref.depth + 1);
        ref.onexit = toOnExitRef(schema.onexit, ref.depth + 1);
        ref.mode = StateMode.default;
        ref.atomic = ref.descendants.length === 0;
    }

    return ref;
}
