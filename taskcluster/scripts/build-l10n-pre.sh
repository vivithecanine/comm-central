#! /bin/bash -vex

set -x -e

echo "running as" $(id)

####
# Taskcluster friendly wrapper for performing fx desktop l10n repacks via mozharness.
# Based on ./build-l10n.sh
####

# Inputs, with defaults

: MOZHARNESS_SCRIPT             ${MOZHARNESS_SCRIPT}
: MOZHARNESS_CONFIG             ${MOZHARNESS_CONFIG}
: MOZHARNESS_CONFIG_PATHS       ${MOZHARNESS_CONFIG_PATHS}
: MOZHARNESS_ACTIONS            ${MOZHARNESS_ACTIONS}
: MOZHARNESS_OPTIONS            ${MOZHARNESS_OPTIONS}

: TOOLTOOL_CACHE                ${TOOLTOOL_CACHE:=/builds/worker/tooltool-cache}

: MOZ_SCM_LEVEL                 ${MOZ_SCM_LEVEL:=1}

: MOZ_SCM_LEVEL                 ${MOZ_SCM_LEVEL:=1}

: WORKSPACE                     ${WORKSPACE:=/builds/worker/workspace}
: MOZ_OBJDIR                    ${MOZ_OBJDIR:=$WORKSPACE/obj-build}

set -v

fail() {
    echo # make sure error message is on a new line
    echo "[build-l10n-pre.sh:error]" "${@}"
    exit 1
}

export MOZ_CRASHREPORTER_NO_REPORT=1
export TINDERBOX_OUTPUT=1

# test required parameters are supplied
if [[ -z ${MOZHARNESS_SCRIPT} ]]; then fail "MOZHARNESS_SCRIPT is not set"; fi
if [[ -z "${MOZHARNESS_CONFIG}" && -z "${EXTRA_MOZHARNESS_CONFIG}" ]]; then fail "MOZHARNESS_CONFIG or EXTRA_MOZHARNESS_CONFIG is not set"; fi

# set up mozharness configuration, via command line, env, etc.

# $TOOLTOOL_CACHE bypasses mozharness completely and is read by tooltool_wrapper.sh to set the
# cache.  However, only some mozharness scripts use tooltool_wrapper.sh, so this may not be
# entirely effective.
export TOOLTOOL_CACHE

export MOZ_OBJDIR

config_path_cmds=""
for path in ${MOZHARNESS_CONFIG_PATHS}; do
    config_path_cmds="${config_path_cmds} --extra-config-path ${GECKO_PATH}/${path}"
done

# support multiple, space delimited, config files
config_cmds=""
for cfg in $MOZHARNESS_CONFIG; do
  config_cmds="${config_cmds} --config ${cfg}"
done

# if MOZHARNESS_ACTIONS is given, only run those actions (completely overriding default_actions
# in the mozharness configuration)
if [ -n "$MOZHARNESS_ACTIONS" ]; then
    actions=""
    for action in $MOZHARNESS_ACTIONS; do
        actions="$actions --$action"
    done
fi

# if MOZHARNESS_OPTIONS is given, append them to mozharness command line run
if [ -n "$MOZHARNESS_OPTIONS" ]; then
    options=""
    for option in $MOZHARNESS_OPTIONS; do
        options="$options --$option"
    done
fi

cd /builds/worker

$GECKO_PATH/mach python -- \
  $GECKO_PATH/${MOZHARNESS_SCRIPT} \
  ${config_path_cmds} \
  ${config_cmds} \
  $actions \
  $options \
  --log-level=debug \
  --work-dir=$WORKSPACE \
