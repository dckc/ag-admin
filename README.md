# Ag Admin - Administrative processes with Agoric (WIP)

## Ping Plugin

```
# We first did the usual start to an Agoric dApp...
# git clone
# agoric install

ag-admin$ agoric deploy api/deploy.js --allow-unsafe-plugins
? Enable unsafe (unconfined) plugins for this deployment?  Type 'yes' if you are sure: yes
Open CapTP connection to ws://127.0.0.1:8000/private/captp...o
agoric: deploy: running /home/connolly/projects/agoric/ag-admin/api/deploy.js
agoric: deploy: Deploy script will run with Node.js ESM
agoric: deploy: Installing unsafe plugin "/home/connolly/projects/agoric/ag-admin/api/src/plugin-sheets.js"
agoric: deploy: Loading plugin "/home/connolly/projects/agoric/ag-admin/_agstate/agoric-servers/dev/plugins/_home_connolly_projects_agoric_ag-admin_api_src_plugin-sheets.js"
{ sheetsPlugin: Object [Alleged: stableForwarder] {} }
{ answer: 'GS: Watson, come quickly!' }
```

## Request 1 BLD (TODO)

Goal: reify the [Request 1 BLD](https://github.com/Agoric/validator-profiles/wiki/Request-1-BLD) process as Zoe smart contract(s). on devnet?

 - ag-solo plug-ins for external
    - inputs:
       - [ ] - Discord API for finding `authorizedRequests()`
       - [ ]  Tendermint RPC, i.e. https GET on `searchBySender()`
    -  Outputs:
       - [ ] Google sheet with status
       - [ ]  something to prompt the (human) signer?
