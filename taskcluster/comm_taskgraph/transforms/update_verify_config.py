# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the beetmover task into an actual task description.
"""

from urllib.parse import urlsplit

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

from gecko_taskgraph.util.attributes import release_level
from gecko_taskgraph.util.scriptworker import get_release_config
from gecko_taskgraph.transforms.task import (
    get_branch_repo,
    get_branch_rev,
)
from gecko_taskgraph.transforms.update_verify_config import (
    ensure_wrapped_singlequote,
)

transforms = TransformSequence()


# The beta regexes do not match point releases.
# In the rare event that we do ship a point
# release to beta, we need to either:
# 1) update these regexes to match that specific version
# 2) pass a second include version that matches that specific version
INCLUDE_VERSION_REGEXES = {
    "beta": r"'^(\d+\.\d+b\d+)$'",
    "nonbeta": r"'^\d+\.\d+(\.\d+)?$'",
    # Previous major versions, for update testing before we update users to a new esr
    "release-next": r"'^91\.\d+(\.\d+)?$'",
}

MAR_CHANNEL_ID_OVERRIDE_REGEXES = {
    "beta": r"'^\d+\.\d+(\.\d+)?$$,thunderbird-comm-beta,thunderbird-comm-release'",
}


ensure_wrapped_singlequote(INCLUDE_VERSION_REGEXES)
ensure_wrapped_singlequote(MAR_CHANNEL_ID_OVERRIDE_REGEXES)


@transforms.add
def add_command(config, tasks):
    keyed_by_args = [
        "channel",
        "archive-prefix",
        "previous-archive-prefix",
        "aus-server",
        "override-certs",
        "include-version",
        "mar-channel-id-override",
        "last-watershed",
    ]
    optional_args = [
        "updater-platform",
    ]

    release_config = get_release_config(config)

    for task in tasks:
        task["description"] = "generate update verify config for {}".format(
            task["attributes"]["build_platform"]
        )

        command = [
            "python",
            "testing/mozharness/scripts/release/update-verify-config-creator.py",
            "--product",
            task["extra"]["product"],
            "--stage-product",
            task["shipping-product"],
            "--app-name",
            task["extra"]["app-name"],
            "--branch-prefix",
            task["extra"]["branch-prefix"],
            "--platform",
            task["extra"]["platform"],
            "--to-version",
            release_config["version"],
            "--to-app-version",
            release_config["appVersion"],
            "--to-build-number",
            str(release_config["build_number"]),
            "--to-buildid",
            config.params["moz_build_date"],
            "--to-revision",
            get_branch_rev(config),
            "--output-file",
            "update-verify.cfg",
        ]

        repo_path = urlsplit(get_branch_repo(config)).path.lstrip("/")
        command.extend(["--repo-path", repo_path])

        if release_config.get("partial_versions"):
            for partial in release_config["partial_versions"].split(","):
                command.extend(["--partial-version", partial.split("build")[0]])

        for arg in optional_args:
            if task["extra"].get(arg):
                command.append(f"--{arg}")
                command.append(task["extra"][arg])

        for arg in keyed_by_args:
            thing = f"extra.{arg}"
            resolve_keyed_by(
                task,
                thing,
                item_name=task["name"],
                platform=task["attributes"]["build_platform"],
                **{
                    "release-type": config.params["release_type"],
                    "release-level": release_level(config.params["project"]),
                },
            )
            # ignore things that resolved to null
            if not task["extra"].get(arg):
                continue
            if arg == "include-version":
                task["extra"][arg] = INCLUDE_VERSION_REGEXES[task["extra"][arg]]
            if arg == "mar-channel-id-override":
                task["extra"][arg] = MAR_CHANNEL_ID_OVERRIDE_REGEXES[task["extra"][arg]]

            command.append(f"--{arg}")
            command.append(task["extra"][arg])

        task["run"].update(
            {
                "using": "mach",
                "mach": " ".join(command),
            }
        )

        yield task
