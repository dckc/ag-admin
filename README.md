# Ag Admin - Administrative processes with Agoric (WIP)

## Request 1 BLD (TODO)

Goal: reify the [Request 1 BLD](https://github.com/Agoric/validator-profiles/wiki/Request-1-BLD) process as Zoe smart contract(s). on devnet?

 - ag-solo plug-ins for external
    - inputs:
       - [x] - Discord API for finding `authorizedRequests()`
       - [x]  Tendermint RPC, i.e. https GET on `searchBySender()`
    -  Outputs:
       - [x] Google sheet with status
       - [ ] something to prompt the (human) signer?
 - [ ] Zoe smart contract to tie them together
## Simple Google Sheets plugin

Supports row `lookup` and `upsert`.

First, configure credentials, sheetId in the environment:

```
$ cat .envrc
export GOOGLE_SERVICES_EMAIL=...@...gserviceaccount.com
export GCS_PRIVATE_KEY=`cat ./google-services-private-key.pem`

export SHEET1_ID=17J...
```

then we install the plug-in and use it to lookup a row in the sheet:

```
$ agoric deploy api/deploy.js --need=local --allow-unsafe-plugins
...
{ sheetsPluginRoot: Object [Alleged: stableForwarder] {} }
{ row: { Batting: '0.300', Name: 'Pete Rose', _rowNumber: 2 } }
```

## Discord REST API plugin

config:
```
export DISCORD_API_TOKEN=...
```

usage:

```
command[0] E(E(home.scratch).get('discord1')).guilds('585576150827532298')
history[0] [Object Alleged: Guild]{}
command[1] guild=history[0]

command[2] E(guild).help()
history[2] Promise.reject("TypeError: target has no method \"help\", has [\"info\",\"members\",\"membersList\",\"roles\"]")
command[3] E(guild).roles()
history[3] [{"color":0,"flags":0,"hoist":false,"icon":null,"id":"585576150827532298","managed":false,"mentionable":false,"name":"@everyone","permissions":104191552,"permissions_new":"1071698531904","position":0,"unicode_emoji":null},
...
```

## Tendermint RPC plugin

config:

```
export TENDERMINT_HOST=rpc-agoric.nodes.guru
```

usage:
```
command[4] E(E(home.scratch).get('tendermint1')).help()
history[4] Promise.reject("TypeError: target has no method \"help\", has [\"searchBySender\",\"transfers\"]")

command[6] E(E(home.scratch).get('tendermint1')).searchBySender('agoric15qxmfufeyj4zm9zwnsczp72elxsjsvd0vm4q8h').then(d => ((found=d), d.length))
history[6] 57
command[7] E(E(home.scratch).get('tendermint1')).transfers(found).then(d => ((txs=d), d.length))
history[7] 57
command[8] txs[0]
history[8] {"amount":"1000000ubld","hash":"CF9EFF2BD3C70F9AB70C56C1F1C47973F15626FEFDD1B1F9DF4F9AB56CA61C4B","recipient":"agoric18du3gnu9qqgrcfln804g8gcmruv2gjwgs7mj3l","sender":"agoric15qxmfufeyj4zm9zwnsczp72elxsjsvd0vm4q8h"}
```

## Ping Plugin

```
# We first did the usual start to an Agoric dApp...
# git clone
# agoric install

ag-admin$ agoric deploy api/deploy.js --need=local --allow-unsafe-plugins
? Enable unsafe (unconfined) plugins for this deployment?  Type 'yes' if you are sure: yes
Open CapTP connection to ws://127.0.0.1:8000/private/captp...o
agoric: deploy: running /home/connolly/projects/agoric/ag-admin/api/deploy.js
agoric: deploy: Deploy script will run with Node.js ESM
agoric: deploy: Installing unsafe plugin "/home/connolly/projects/agoric/ag-admin/api/src/plugin-sheets.js"
agoric: deploy: Loading plugin "/home/connolly/projects/agoric/ag-admin/_agstate/agoric-servers/dev/plugins/_home_connolly_projects_agoric_ag-admin_api_src_plugin-sheets.js"
{ sheetsPlugin: Object [Alleged: stableForwarder] {} }
{ answer: 'GS: Watson, come quickly!' }
```
