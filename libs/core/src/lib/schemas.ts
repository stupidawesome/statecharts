export interface ExecutableContent {
  def: ExecutableSchema<any>;
}

export interface SendSchema {
  command: CommandType.send;
  event?: string;
  target?: string;
  type?: string;
  id?: string;
  delay?: string;
  content?: any;
}

export interface RaiseSchema {
  command: CommandType.raise;
  event: string;
}

export interface ScriptSchema {
  command: CommandType.script;
  src: string;
}

export type ExecutableSchema<T extends { [key: string]: any }> = (
  | AssignSchema<T>
  | SendSchema
  | RaiseSchema
  | ScriptSchema
  )[];


export interface HistoryContent {
  [key: string]: ExecutableContent[];
}

export interface TransitionSchema<T extends { [key: string]: any }> {
  event?: string[];
  target?: string[];
  cond?: string | Function;
  type?: "internal" | "external";
  command?: ExecutableSchema<T>;
}

export interface OnEntrySchema<T extends { [key: string]: any }>
  extends ExecutableSchema<T> {}
export interface OnExitSchema<T extends { [key: string]: any }>
  extends ExecutableSchema<T> {}

export interface InvokeSchema {
  id: string;
  src: string | ScxmlSchema;
  autoforward?: boolean;
}

export interface HistorySchema {
  id: string;
  mode: "history";
  type: "shallow" | "deep";
  // not sure how this is used
  // transition: {
  //     target: string[]
  // }
}

export interface FinalSchema {
  id: string;
  mode: "final";
  donedata?: any;
}

export interface StateSchema<T extends { [key: string]: any } = any> {
  id: string;
  initial?: string[];
  state?: (StateSchema<T> | ParallelSchema<T> | FinalSchema | HistorySchema)[];
  transition?: TransitionSchema<T>[];
  onentry?: OnEntrySchema<T>;
  onexit?: OnExitSchema<T>;
  invoke?: InvokeSchema[];
  datamodel?: DataSchema<T>[];
}

export type ExprSchema<T extends any> =
  | T
  | ((value: T, event: ScxmlEvent) => T);

export interface DataSchema<T, U extends keyof T = keyof T> {
  id: U;
  expr: T[U];
}

export interface ParallelSchema<T extends { [key: string]: any } = any> {
  id: string;
  mode: "parallel";
  state?: (StateSchema<T> | ParallelSchema<T> | HistorySchema)[];
  transition?: TransitionSchema<T>[];
  onentry?: OnEntrySchema<T>;
  onexit?: OnExitSchema<T>;
  invoke?: InvokeSchema[];
  datamodel?: DataSchema<T>[];
}

export interface ScxmlSchema<T extends { [key: string]: any } = any> {
  initial?: string[];
  binding?: "early" | "late";
  state?: (StateSchema<T> | ParallelSchema<T> | FinalSchema)[];
  datamodel?: DataSchema<T>[];
}

export interface ScxmlEvent {
  name: string;
  type: "internal" | "external";
  sendId: string | undefined;
  origin: string | undefined;
  originType: string | undefined;
  invokeid: string | undefined;
  data: any;
  target: string;
}

export enum CommandType {
  assign,
  send,
  raise,
  script,
  cancel
}

export interface AssignSchema<T, U = any> {
  command: CommandType.assign;
  location: (t: T) => U;
  expr: (value: U, event: ScxmlEvent) => U;
}

interface SendOptions {
  event?: string;
  target?: string;
  type?: string;
  id?: string;
  delay?: string;
  content?: any;
}

export interface ScxmlNode {
  depth: number;
  documentOrder: number;
}

export enum StateMode {
  default,
  parallel,
  final,
  history
}
