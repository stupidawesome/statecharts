import {
    assign,
    final,
    history,
    Interpreter,
    invoke, log,
    parallel, raise,
    RootMetadata,
    send,
    state,
    transition,
} from "@statecharts/core"
import { TestInterpreter } from "../test-interpreter"
import { CANCEL } from "../utils"

interface FsmTest {
    description: string
    schema: RootMetadata,
    events: any[],
    data?: any,
    result: string[]
}

const tests: FsmTest[] = [
    {
        description: "should create a machine",
        schema: [],
        events: [],
        result: []
    },
    {
        description: "should enter initial state",
        schema: [state("init")],
        events: [],
        result: ["init"]
    },
    {
        description: "should transition to next state",
        schema: [
            state("init", [
                transition("NEXT").to("next")
            ]),
            state("next")
        ],
        events: ["NEXT"],
        result: ["next"]
    },
    {
        description: "should enter compound state",
        schema: [
            state("parent", [
                state("child")
            ])
        ],
        events: [],
        result: ["parent", "child"]
    },
    {
        description: "should enter parallel state",
        schema: [
            parallel("parent", [
                state("first"),
                state("second")
            ])
        ],
        events: [],
        result: ["parent", "first", "second"]
    },
    {
        description: "should enter shallow history state",
        schema: [
            state("parent", [
                state("deep", [
                    state("first", [
                        transition("SECOND").to("second")
                    ]),
                    state("second", [
                        transition("NEXT").to("next")
                    ]),
                ]),
                history("return"),
            ]),
            state("next", [
                transition("RETURN").to("return")
            ])
        ],
        events: [
            "SECOND",
            "NEXT",
            "RETURN",
        ],
        result: ["parent", "deep", "first"]
    },
    {
        description: "should enter deep history state",
        schema: [
            state("parent", [
                state("deep", [
                    state("first", [
                        transition("SECOND").to("second")
                    ]),
                    state("second", [
                        transition("NEXT").to("next")
                    ]),
                ]),
                history.deep("return"),
            ]),
            state("next", [
                transition("RETURN").to("return")
            ])
        ],
        events: [
            "SECOND",
            "NEXT",
            "RETURN",
        ],
        result: ["parent", "deep", "second"]
    },
    {
        description: "should transition conditionally",
        schema: [
            state("parent", [
                transition("*")
                    .when((event) => event.value < 0.5)
                    .to("first"),
                transition("*")
                    .when((event) => event.value < 0.5)
                    .to("second"),
            ]),
            state("first"),
            state("second")
        ],
        events: [{ value: 0.4 }],
        result: ["first"]
    },
    {
        description: "should enter final state",
        schema: [
            state("init", [
                transition("NEXT").to("final")
            ]),
            final("final", [
                transition("NEXT").to("init") // should never be called
            ])
        ],
        events: ["NEXT", "NEXT"],
        result: []
    },
    {
        description: "should transition internally",
        schema: [
            state("init", [
                transition().action(
                    log()
                )
            ])
        ],
        events: ["NEXT"],
        result: ["init"]
    },
    {
        description: "should stop intepreter",
        schema: [
            state("init")
        ],
        events: [CANCEL],
        result: []
    }
]

function runTests(fsmTests: FsmTest[], opts: { debug?: boolean } = {}) {
    for (const config of fsmTests) {
        test(config.description, (done) => {
            const machine = new TestInterpreter(config.schema, opts.debug)

            if (config.schema.length) {
                machine.start()
            }

            for (const event of config.events) {
                machine.send(typeof event === "string" ? { name: event } : event)
            }

            setTimeout(() => {
                expect(machine.state).toEqual(config.result)
                done()
            })
        })
    }
}

describe("Interpreter", () => {
    runTests(tests)
})

describe("Invoke", () => {
    test("should invoke service when entering state", () => {
        const child = new Interpreter([
            state("childInit")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child", child)
            ])
        ])

        parent.start()

        expect(child.state).toEqual(["childInit"])
        expect(parent.state).toEqual(["init"])
    })

    test("should send event with target to invoked child", (done) => {
        const child = new Interpreter([
            state("childInit", [
                transition("NEXT").to("next")
            ]),
            state("next")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child", child),
                transition("NEXT").to("next")
            ]),
            state("next") // should not enter this state
        ])

        parent.start()
        parent.send({ name: "NEXT" }, "child")

        setTimeout(() => {
            expect(child.state).toEqual(["next"])
            expect(parent.state).toEqual(["init"])
            done()
        })
    })

    test("should cancel invoked child when exiting state", (done) => {
        const child = new Interpreter([
            state("childInit", [
                transition("NEXT").to("next")
            ]),
            state("next")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child", child),
                transition("NEXT").to("next")
            ]),
            state("next")
        ])

        parent.start()
        parent.send({ name: "NEXT" })

        setTimeout(() => {
            expect(child.state).toEqual([])
            expect(parent.state).toEqual(["next"])
            done()
        })
    })

    test("should return done event", (done) => {
        const child = new Interpreter([
            state("childInit", [
                transition("NEXT").to("done")
            ]),
            final("done")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child", child),
                transition.done("child").to("next")
            ]),
            state("next")
        ])

        parent.start()
        parent.send({ name: "NEXT" }, "child")

        setTimeout(() => {
            expect(child.state).toEqual([])
            expect(parent.state).toEqual(["next"])
            done()
        })
    })

    test("should autoforward events", (done) => {
        const child = new Interpreter([
            state("childInit", [
                transition("NEXT").to("next")
            ]),
            state("next")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child").forwardTo(child),
            ]),
        ])

        parent.start()
        parent.send({ name: "NEXT" })

        setTimeout(() => {
            expect(child.state).toEqual(["next"])
            expect(parent.state).toEqual(["init"])
            done()
        })
    })

    test("should execute finalized actions", (done) => {
        const child = new TestInterpreter([
            state("childInit", [
                transition("NEXT").to("done")
            ]),
            final("done")
        ])
        const parent = new TestInterpreter([
            state("init", [
                invoke("child", child).finalize(
                    log("finalizing invoke child")
                ),
                transition.done("child").to("next")
            ]),
            state("next")
        ])

        parent.start()
        parent.send({ name: "NEXT" }, "child")

        setTimeout(() => {
            expect(child.state).toEqual([])
            expect(parent.state).toEqual(["next"])
            expect(child.output).toEqual("finalizing invoke child")
            done()
        })
    })
})

describe("Action", () => {
    test("should send event on transition", (done) => {
        const machine = new TestInterpreter([
            state("init", [
                invoke("child", new TestInterpreter([
                    state("childInit", [
                        transition().action(
                            send({ name: "NEXT", target: "_parent" })
                        )
                    ])
                ])),
                transition("NEXT").to("next")
            ]),
            state("next")
        ])

        machine.start()
        machine.send({}, "child")

        setTimeout(() => {
            expect(machine.state).toEqual(["next"])
            done()
        })
    })

    test("should raise event on transition", (done) => {
        const machine = new TestInterpreter([
            state("init", [
                transition("NEXT").action(
                    raise("DONE")
                ),
                transition("DONE").to("next")
            ]),
            state("next")
        ])

        machine.start()
        machine.send({ name: "NEXT" })

        setTimeout(() => {
            expect(machine.state).toEqual(["next"])
            done()
        })
    })

    test("should log a message on transition", (done) => {
        const machine = new TestInterpreter([
            state("init", [
                transition("LOG").action(
                    log("during transmission")
                ),
            ]),
        ])

        machine.start()
        machine.send({ name: "LOG" })

        setTimeout(() => {
            expect(machine.output).toEqual("during transmission")
            done()
        })
    })

    test("should assign data on transition", (done) => {
        const machine = new TestInterpreter([
            state("init", [
                transition("NEXT").action(
                    assign((data: any) => data.count += 1)
                ).to("next")
            ]),
            state("next")
        ])

        machine.start({ count: 0 })
        machine.send({ name: "NEXT" })

        setTimeout(() => {
            expect(machine.state).toEqual(["next"])
            expect(machine.datamodel).toEqual({ count: 1 })
            done()
        })
    })
})
