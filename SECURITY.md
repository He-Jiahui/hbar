# Security policy

hbar runs a local Bun Host that may read project files, execute approved commands, and load trusted in-process plugins. Please treat security reports and diagnostic data as sensitive.

## Reporting a vulnerability

Please use the repository's **Security → Advisories → Report a vulnerability** entry to send a private report. Do not open a public Issue or include exploit details in a Pull Request. If private reporting is not available for the repository, contact a maintainer privately first and wait for acknowledgement before publishing details.

Include the affected hbar version or commit, operating system, runtime (browser, Tauri desktop, or CLI), minimal reproduction steps, impact, and a suggested mitigation when available. Redact API keys, device tokens, pairing codes, cookies, private paths, prompts, and database contents from every attachment.

## Supported versions

The latest tagged release and the current `master` branch receive security fixes. Older commits may contain known issues; reproduce on the latest version before reporting when possible.

## Safe disclosure

Maintainers will coordinate a fix and release or mitigation when practical. Please avoid testing against another person's Host, workspace, credentials, or model account. The [Wiki security guide](docs/wiki/Security-and-data.md) describes the local execution, network, and plugin boundaries to consider while preparing a report.
