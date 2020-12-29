import { inject, InjectionToken, INJECTOR, Injector } from "@angular/core"
import { RootMetadata } from "@statecharts/core"
import { InvokeNode } from "./interfaces"
import { Interpreter } from "./interpreter"

export abstract class Machine extends Interpreter {}

function isInjectionToken(token: any) {
    return typeof token === "function" || token instanceof InjectionToken
}

export class NgInterpreter extends Interpreter {
    cancelInvoke(inv: InvokeNode) {
        if (isInjectionToken(inv.src)) {
            const instance = this.invokeMap.get(inv.id)
            if (instance) {
                instance?.ngOnDestroy()
            }
        } else {
            super.cancelInvoke(inv)
        }
    }

    invoke(inv: InvokeNode) {
        if (isInjectionToken(inv.src)) {
            this.invokeMap.set(inv.id, this.injector.get(inv.src))
        } else {
            super.invoke(inv)
        }
    }

    constructor(doc: RootMetadata, public injector: Injector = inject(INJECTOR)) {
        super(doc)
    }
}

export function createFsm(doc: RootMetadata) {
    return [{
        provide: Machine,
        useFactory: () => {
            return new NgInterpreter(doc)
        }
    }]
}
