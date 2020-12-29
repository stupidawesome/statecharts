import {
    Component, HostBinding, HostListener,
    Inject,
    Injectable,
    InjectionToken, Input,
    ModuleWithProviders,
    NgModule, Output,
} from "@angular/core"
import {parallel, schema, script, ScxmlSchema, transition, trigger} from "@statecharts/core"
import { Observable, of } from "rxjs"
import {state} from "./schema-builders";

export interface SchemaProvider {
    name: string
    schema: ScxmlSchema
}

export const SCHEMA = new InjectionToken<SchemaProvider[]>("SCHEMA")

@Injectable()
export class StateChartsService {
    constructor(@Inject(SCHEMA) private schemas: SchemaProvider[]) {}

    init() {}
}

@Injectable()
export class Machine extends Observable<any> {
    constructor(schema: any) {
        super()
    }

    send() {}
}

declare var Dispatch: any
declare var MachineEvents: any
declare var MachineSelect: any

declare type State<T> = any

export class ButtonState {}
export class PointerDown {}
export class PointerUp {}
export class HostEmitter<T> {}
export class PointerEnter {}
export class PointerLeave {}
export class Focus {}
export class Blur {}
export class Disable {}
export class Enable {}

declare var withProviders: any

export const Button = schema([
    state("disabled", [
        trigger(Enable, [
            transition("default")
        ])
    ]),
    parallel("default", [
        trigger(Disable, [
            transition("disabled")
        ]),
        trigger(Blur, [
            transition("default")
        ]),
        state("active", [
            state("pointerup", [
                trigger(PointerDown, [
                    transition("pointerdown"),
                ]),
            ]),
            state("pointerdown", [
                trigger(PointerUp, [
                    transition("pointerup"),
                    script("pressed")
                ])
            ])
        ]),
        state("hover", [
            state("pointerout", [
                trigger(PointerEnter, [
                    transition("pointerin")
                ])
            ]),
            state("pointerin", [
                trigger(PointerLeave, [
                    transition("pointerout")
                ]),
            ])
        ]),
        state("focus",[
            state("blurred", [
                trigger(Focus, [
                    transition("focused")
                ])
            ]),
            state("focused")
        ])
    ])
])

declare var connect: any

const providers = [
    Machine({
        schema: Button,
        context: ButtonComponent
    }),
    Dispatch({
        from: ButtonComponent,
        map: {
            disabled: state => state.data.disabled ? Disable : Enable,
            pointerenter: PointerEnter,
            pointerleave: PointerLeave,
            pointerdown: PointerDown,
            pointerup: PointerUp,
            focus: Focus,
            blur: Blur,
        },
        to: Button,
    }),
    Select({
        from: Button,
        map: {
            active: state => state.matches("pointerdown"),
            hover: state => state.matches("pointerin"),
            focus: state => state.matches("focused"),
        },
        to: ButtonComponent
    })
]

@Component({
    template: "<ng-content></ng-content>",
    providers: providers,
})
export class ButtonComponent {
    @Input()
    disabled: boolean = false

    @HostBinding("class.active")
    active: boolean = false

    @HostBinding("class.hover")
    hover: boolean = false

    @HostBinding("class.focused")
    focused: boolean = false

    @Output()
    pressed = new HostEmitter()

    @HostListener("pointerenter")
    pointerenter = new HostEmitter()

    @HostListener("pointerleave")
    pointerleave = new HostEmitter()

    @HostListener("pointerdown")
    pointerdown = new HostEmitter()

    @HostListener("pointerup")
    pointerup = new HostEmitter()

    @HostListener("focus")
    focus = new HostEmitter()

    @HostListener("blur")
    blur = new HostEmitter()

    constructor() {
        connect(this)
    }
}

declare var Select: any

// export class MyComponent {
//     @Select({ from: Machine })
//     selectState() {
//         return {
//             count: (state: any) => state.count
//         }
//     }
//
//     @Dispatch(Event, { to: Machine })
//     sendCommand() {
//         return of("yep")
//     }
// }

@NgModule()
export class StateChartsModule {
    constructor(stateCharts: StateChartsService) {
        stateCharts.init()
    }

    static forRoot(): ModuleWithProviders<StateChartsModule> {
        return {
            ngModule: StateChartsModule,
            providers: [],
        }
    }
}
