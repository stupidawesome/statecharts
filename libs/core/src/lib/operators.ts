import {AssignSchema, CommandType, RaiseSchema, ScriptSchema, ScxmlEvent, SendSchema} from "./schemas";

interface SendOptions {
    event?: string;
    target?: string;
    type?: string;
    id?: string;
    delay?: string;
    content?: any;
}

function send(event: SendOptions | string): SendSchema {
  return {
    command: CommandType.send,
    ...(typeof event === "string" ? { event } : event)
  };
}

function raise(event: string): RaiseSchema {
  return {
    command: CommandType.raise,
    event: event
  };
}

function script(src: string): ScriptSchema {
  return {
    command: CommandType.script,
    src
  };
}

function cancel(event: string) {
  return {
    command: CommandType.cancel,
    event: event
  };
}

function assign<T, U>(
  location: (t: T) => U,
  expr: (value: U, event: ScxmlEvent) => U
): AssignSchema<T, U>;
function assign<T, U>(
  location: (t: T) => U
): (expr: (value: U, event: ScxmlEvent) => U) => AssignSchema<T, U>;
function assign(location: any, expr?: any): any {
  return arguments.length === 1
    ? function(expr: (value: any) => any) {
      return assign(location, expr);
    }
    : {
      command: CommandType.assign,
      location,
      expr
    };
}
