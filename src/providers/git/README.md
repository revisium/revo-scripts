# Git providers

This area owns bounded Git capabilities used by Git scripts. It does not own script manifests, result contracts, or pipeline decisions.

## Structure

```text
contracts/              handler-safe Git client contracts
adapters/node/          process-backed provider implementation
```

Contracts hide process execution, workspace paths, environment variables, and credentials from script handlers. Adapters receive those privileged values through the host/provider SPI and expose only bounded clients.

Each provider family and adapter must follow [the provider card](../../../docs/authoring/provider-readme.template.md).

`porcelain-v2` in parser names identifies Git's upstream `--porcelain=v2` wire format. It is not a package/provider implementation version.
