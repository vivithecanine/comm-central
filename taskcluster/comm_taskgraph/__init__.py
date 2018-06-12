from __future__ import absolute_import, print_function, unicode_literals

import os
from taskgraph.util.yaml import load_yaml
from taskgraph.util.python_path import find_object


def _get_aliases(kind, job):
    aliases = {job['name']}

    if kind == 'toolchain':
        if job['run'].get('toolchain-alias'):
            aliases.add(job['run'].get('toolchain-alias'))

    return aliases


def _get_loader(path, config):
    try:
        loader = config['loader']
    except KeyError:
        raise KeyError("{!r} does not define `loader`".format(path))
    return find_object(loader)


def reference_loader(kind, path, config, params, loaded_tasks):
    """
    Loads selected jobs from a different taskgraph hierarchy.

    This loads jobs of the given kind from the taskgraph rooted at `base-path`,
    and includes all the jobs with names or aliaes matching the names in the
    `jobs` key.
    """
    base_path = config.pop('base-path')
    sub_path = os.path.join(base_path, kind)
    sub_config = load_yaml(sub_path, "kind.yml")
    loader = _get_loader(sub_path, sub_config)
    inputs = loader(kind, sub_path, sub_config, params, loaded_tasks)

    jobs = config.pop('jobs', None)

    config.update(sub_config)

    if jobs is not None:
        jobs = set(jobs)
        return (job for job in inputs if (_get_aliases(kind, job) & jobs))
    else:
        return inputs


def remove_widevine_and_stub_installer(config, jobs):
    """
    Remove references to widevine signing and to packaging a stub installer.

    This is an expedient hack to avoid adding special cases for handling these in
    mozilla-central code.  This code should become unnesssary after the
    declarative artifact[1] work is complete.

    [1] https://bugzilla.mozilla.org/show_bug.cgi?id=1466714
    """
    for job in jobs:
        task = job['task']
        payload = task['payload']

        for scope in ['project:comm:thunderbird:releng:signing:format:widevine',
                      'project:comm:thunderbird:releng:signing:format:sha2signcodestub']:
            if scope in task['scopes']:
                task['scopes'].remove(scope)
        if 'upstreamArtifacts' in payload:
            for artifact in payload['upstreamArtifacts']:
                if 'widevine' in artifact.get('formats', []):
                    artifact['formats'].remove('widevine')
                artifact['paths'] = [path for path in artifact['paths']
                                     if not path.endswith(('/setup-stub.exe',
                                                           '/target.stub-installer.exe',))]
            payload['upstreamArtifacts'] = [artifact for artifact in payload['upstreamArtifacts']
                                            if artifact.get('formats', []) != ['sha2signcodestub']]
        if 'artifacts' in payload and isinstance(payload['artifacts'], list):
            payload['artifacts'] = [artifact for artifact in payload['artifacts']
                                    if not artifact['name'].endswith('/target.stub-installer.exe')]
        if 'env' in payload:
            if 'SIGNED_SETUP_STUB' in payload['env']:
                del payload['env']['SIGNED_SETUP_STUB']

        yield job


def beetmover_add_langpack(config, jobs):
    """
    Add langpacks to beetmover jobs.

    Firefox signs addons as part of the release process, so has separate tasks
    for signing and then publishing. Gettin the mozilla-central code to handle
    uploading unsigned langpacks is complex, so add them afterwards. This code
    should become unnesssary after the declarative artifact[1] work is complete.

    [1] https://bugzilla.mozilla.org/show_bug.cgi?id=1466714
    """
    for job in jobs:
        task = job['task']
        payload = task['payload']
        locale = job['attributes'].get('locale')

        artifact_prefix = "public/build"
        if locale:
            artifact_prefix = '{}/{}'.format(artifact_prefix, locale)

        payload['upstreamArtifacts'].append({
            "locale": locale or 'en-US',
            "paths": [
                "{}/target.langpack.xpi".format(artifact_prefix),
            ],
            "taskId": {
                "task-reference": "<build>"
            },
            "taskType": "build"
        })
        yield job
