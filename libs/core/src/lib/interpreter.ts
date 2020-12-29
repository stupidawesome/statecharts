import { BaseInterpreter } from "./base-interpreter"
import { InvokeNode, StateDocument } from "./interfaces"
import { ContentSchema, expandSchema, RootMetadata, state, target, TransitionSchema } from "./schema"
import { CANCEL, hasLegalCompletion } from "./utils"

export class Interpreter extends BaseInterpreter {
    id: string
    datamodel: any;
    invokeMap: Map<string, any>

    get state() {
        return Array.from(this.configuration, v => v.id)
    }

    applyFinalize(inv: InvokeNode, externalEvent: any): void {
        const invoke = this.invokeMap.get(inv.id)
        if (invoke.src instanceof BaseInterpreter) {
            invoke.src.event = externalEvent
            invoke.src.executeContent(inv.content)
        }
    }

    executeContent(contents: ContentSchema[] = []): void {
        for (const content of contents) {
            switch(content.type) {
                case "send": {
                    this.send(content.payload)
                    break
                }
                case "raise": {
                    this.raise(content.payload)
                    break
                }
                case "assign": {
                    this.assign(content.payload)
                    break
                }
                case "log": {
                    this.log(content.payload)
                }
            }
        }
    }

    log(message?: string) {
        if (message) {
            console.log(`log: ${message}`)
        }
        console.log("event:", this.event)
        console.log("datamodel:", this.datamodel)
    }

    assign(reducers: ((datamodel: any, event: any) => any)[] = []) {
        for (const reduce of reducers) {
            reduce(this.datamodel, this.event)
        }
    }

    invoke(inv: InvokeNode): void {
        if (inv.src instanceof BaseInterpreter) {
            this.invokeMap.set(inv.id, inv)
            inv.src.id = inv.id
            inv.src.parent = this
            inv.src.start()
        }
    }

    cancelInvoke(inv: InvokeNode): void {
        const invoke = this.invokeMap.get(inv.id)
        if (invoke.src instanceof BaseInterpreter) {
            invoke.src.send(CANCEL)
        }
    }

    returnDoneEvent(donedata: any): void {
        if (this.parent) {
            this.parent.send({
                name: `done.invoke.${this.id}`,
                invokeid: this.id
            })
        }
    }

    raise(event: any) {
        this.internalQueue.enqueue(event)
    }

    send(externalEvent: any, to: string = externalEvent.target): void {
        if (!to || to === "_self" || to === this.id) {
            this.externalQueue.enqueue(externalEvent)
        } else {
            if (to === "_parent" && this.parent) {
                this.parent.send(externalEvent, "_self")
            } else {
                const child = this.invokeMap.get(to)
                if (child.src instanceof Interpreter) {
                    child.src.send(externalEvent)
                }
            }
        }
    }

    constructor(doc: RootMetadata = []) {
        const root = state("$$root", doc)
        const states = new Map()
        const transitions = new Set<TransitionSchema>()
        expandSchema(doc, root, states, transitions)
        root.ancestors = [root]
        root.parent = root
        for (const element of Array.from(transitions)) {
            element.target = element[target].map((t) => states.get(t)).filter(s => s !== undefined)
        }
        super(root as StateDocument)

        for (const element of Array.from(transitions)) {
            if (!hasLegalCompletion(element.target)) {
                throw new Error(`Invalid transition target`)
            }
        }

        this.datamodel = {
            event: undefined,
            state: {}
        }
        this.invokeMap = new Map()
        this.id = ""
    }
}
