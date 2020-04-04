import {BaseInterpreter} from "./base-interpreter";
import {CommandType} from "./schemas";
import {ExecutableRef, InvokeRef} from "./models";

export class Interpreter extends BaseInterpreter {
    callbacks = new Map();
    srcMap = {};

    on(event, callback) {
        (
            this.callbacks.get(event) || this.callbacks.set(event, []).get(event)
        ).push(callback);
    }

    executeContent(content: ExecutableRef) {
        const { datamodel, context } = this;
        if (!content) {
            return;
        }
        function createProxy(value, path) {
            return new Proxy(value, {
                get(target: any, p: string | number | symbol, receiver: any): any {
                    const _value = target[p];
                    path.push(p);
                    return typeof _value === "object" && _value !== null
                        ? createProxy(target[p], path)
                        : _value;
                }
            });
        }
        function getPath(fn, value) {
            const path = [];
            const proxy = createProxy(value, path);
            fn(proxy);
            return path;
        }
        function resolve(path, obj) {
            return path.reduce((next, key) => next[key], obj);
        }
        function setValue(path, obj, value) {
            const target = resolve(path.slice(0, -1), obj);
            target[path[path.length - 1]] = value;
        }

        for (const command of content.commands) {
            const def = command.def;
            switch (def.command) {
                case CommandType.assign: {
                    const path = getPath(def.location, datamodel.data);
                    const value = resolve(path, datamodel.data);
                    const nextValue =
                        typeof def.expr === "function"
                            ? def.expr(value, datamodel._event)
                            : def.expr;
                    setValue(path, datamodel.data, nextValue);
                    break;
                }
                case CommandType.send: {
                    this.send(
                        {
                            name: def.event,
                            origin: def.id,
                            type: def.type,
                            data: def.content,
                            delay: def.delay
                        },
                        def.target
                    );
                    break;
                }
                case CommandType.raise: {
                    this.send({
                        event: def.event,
                        target: "_internal"
                    });
                    break;
                }
                case CommandType.script: {
                    context[def.src](datamodel.data, datamodel._event);
                    break;
                }
                default: {
                    throw new Error(`unknown command: ${JSON.stringify(command.def)}`);
                }
            }
        }
    }

    cancelInvoke(inv: InvokeRef) {
        const instance = this.invokes[inv.id];
        if (instance instanceof BaseInterpreter) {
            instance.exitInterpreter();
        }
    }

    returnDoneEvent(donedata: any) {
        const callbacks = this.callbacks.get("done");
        if (callbacks) {
            callbacks.forEach(callback => callback(donedata));
        }
    }

    send(event: any, target?: string) {
        if (target === "_internal") {
            console.log("raise: " + event.name);
            this.internalQueue.enqueue(event);
        } else if (target === "_parent" && this.parent) {
            console.log("parent");
            this.parent.send(event);
        } else if (target) {
            const invoke: Interpreter = this.invokes[target];
            invoke.send({
                name: event.name,
                data: event.data,
                origin: this
            });
        } else {
            console.log("send: " + event.name);
            this.externalQueue.enqueue(event);
        }
    }

    applyFinalize(inv: any, externalEvent: any) {
        // not implemented
    }

    invoke(inv: InvokeRef) {
        const { invokes } = this;

        if (!inv.type) {
            if (invokes[inv.id]) {
                throw new Error(`Already invoked "${inv.id}"`);
            }
            const child = new Interpreter(
                typeof inv.src === "string" ? this.srcMap[inv.src] : inv.src,
                this
            );
            invokes[inv.id] = child;

            child.on("done", () => {
                this.send(`done.invoke.${inv.id}`);
            });
        }
    }
}
