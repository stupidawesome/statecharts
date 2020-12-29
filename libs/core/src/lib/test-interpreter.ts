import { RootMetadata } from "@statecharts/core"
import { Interpreter } from "./interpreter"

export class TestInterpreter extends Interpreter {
    output?: string
    log(message?: string) {
        this.output = message
        if (this.debug) {
            super.log(message)
        }
    }
    constructor(doc: RootMetadata, public debug = false) {
        super(doc)
    }
}
