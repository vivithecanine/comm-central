/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionError } = ExtensionUtils;

/**
 * Represents (in the child extension process) a compose script registered
 * programmatically (instead of being included in the addon manifest).
 *
 * @param {ExtensionPageContextChild} context
 *        The extension context which has registered the compose script.
 * @param {string} scriptId
 *        An unique id that represents the registered compose script
 *        (generated and used internally to identify it across the different processes).
 */
class ComposeScriptChild {
  constructor(context, scriptId) {
    this.context = context;
    this.scriptId = scriptId;
    this.unregistered = false;
  }

  async unregister() {
    if (this.unregistered) {
      throw new ExtensionError("compose script already unregistered");
    }

    this.unregistered = true;

    await this.context.childManager.callParentAsyncFunction(
      "composeScripts.unregister",
      [this.scriptId]
    );

    this.context = null;
  }

  api() {
    const { context } = this;

    return {
      unregister: () => {
        return context.wrapPromise(this.unregister());
      },
    };
  }
}

this.composeScripts = class extends ExtensionAPI {
  getAPI(context) {
    return {
      composeScripts: {
        register(options) {
          return context.cloneScope.Promise.resolve().then(async () => {
            const scriptId = await context.childManager.callParentAsyncFunction(
              "composeScripts.register",
              [options]
            );

            const registeredScript = new ComposeScriptChild(context, scriptId);

            return Cu.cloneInto(registeredScript.api(), context.cloneScope, {
              cloneFunctions: true,
            });
          });
        },
      },
    };
  }
};
