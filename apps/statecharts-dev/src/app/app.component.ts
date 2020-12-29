import {Component} from '@angular/core';
import {schema, state, transition, trigger} from "@statecharts/core";
import {assign} from "@statecharts/core";
import {createSelector} from "../../../../libs/core/src/lib/example";

interface User {
    name: string
}

export interface AppModel {
    users: User[]
}

const select = createSelector<AppModel>()
const setUsers = select(data => data.users)

const machine = schema<AppModel>([
    state("idle", [
        trigger("loadUsers", [
            transition("loading")
        ])
    ]),
    state("loading", [
        trigger("done", [
            transition("done"),
            setUsers((value, event) => event.data)
        ])
    ])
])


@Component({
  selector: 'statecharts-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'statecharts-dev';
}
