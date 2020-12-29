import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import {StateChartsModule} from "../../../../libs/core/src/lib/statecharts.module";

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, StateChartsModule.forRoot()],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
