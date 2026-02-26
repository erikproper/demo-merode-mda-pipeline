BIG Modelling Bus Go Module
===========================

RAW COPY from MQTT client. Just to see what the syntax is of this file.


This repository contains the source code for the [Eclipse Paho](https://eclipse.org/paho) MQTT 3.1/3.11 Go client library.

This code builds a library which enable applications to connect to an [MQTT](https://mqtt.org) broker to publish
messages, and to subscribe to topics and receive published messages.

This library supports a fully asynchronous mode of operation.

A client supporting MQTT V5 is [also available](https://github.com/eclipse/paho.golang).

Installation and Build
----------------------

The process depends upon whether you are using [modules](https://golang.org/ref/mod) (recommended) or `GOPATH`.

#### Modules

If you are using [modules](https://blog.golang.org/using-go-modules) then `import "github.com/eclipse/paho.mqtt.golang"`
and start using it. The necessary packages will be download automatically when you run `go build`.

Note that the latest release will be downloaded and changes may have been made since the release. If you have
encountered an issue, or wish to try the latest code for another reason, then run
`go get github.com/eclipse/paho.mqtt.golang@master` to get the latest commit.

#### GOPATH

Installation is as easy as:

```
go get github.com/eclipse/paho.mqtt.golang
```

The client depends on Google's [proxy](https://godoc.org/golang.org/x/net/proxy) package and the
[websockets](https://godoc.org/github.com/gorilla/websocket) package, also easily installed with the commands:

```
go get github.com/gorilla/websocket
go get golang.org/x/net/proxy
```


Usage and API
-------------




** The Modelling Bus **


/**************************************************************************************
 *
 * The modelling bus
 *
 **************************************************************************************

- Order of model updates
- A posting agent always start with a state update


 The modelling bus provides an infrastructure to let different agents exchange and
 manipulate (digital) artefacts related to a model-driven engineering workflow.

 Examples of such agents include:
 - graphical modelling front-end
 - code generators, e.g. from ER to SQL,
 - model transformers/synchronisers, e.g. DEMO to BPMN and back
 - a speech to text converter to enable spoken inputs
 - a coordinating agent, which coordinates the overall process
 - etc

 The artefacts shared on the bus can include:
 - Models (represented as JSON records)
 - Files (e.g. audio, images, models in an external format, office documents, etc)
 - Transactions (requests + acknowledge, and reports + acknowledge) between agents
   (used to coordinate the work "around" the bus
 - Observations of sensors and/or agents

 Per artefact kind, there are different rules regarding their behaviour when they
 are received by an agent:
 - Models are persistent. They may be updated, but multiple agents can read them.
 - Files are persistent as well.
 - Requests and reports are not persistent. Once read by their intended recipient, 
   they are
   removed (by the recipient) from the bus

EDITING



 A key assumption is that among the the agents connected to the bus, there is one
 coordinator. This is also why there is no general "group" or "all" request/report.
 The coordinator needs to distribute requests to each agent it would need to act.
 Note: any agent can share an observation.

 ... one coordinator of the work. So, also no group requests/reports

 Topics

 Simple ... FTP and MQTT

 So ... the topics ...

 The topical structure ... MQTT topics, and paths on the FTP server


Topics on the bus. Some pertaining to models. Some to messages. Some to files.

MQTT topics will be reflected in the path as well.


As the architecture of the modelling bus, as a concept in itself, may evolve, it
has a version (modellingBusVersion), which will be included in the topic

The modelling bus involves experiments with different set up of modelling
infrastructures. Each experiment has an identifier, which will also be included in the
topic/path

Models are identified by a unique identifier, which will also be included in
	Models are represented as JSON's with a structured that is determined by the 
	meta-model
	of the used modelling language.
	The mapping from the meta-model to the actual JSON structure might also have 
	variations.
	Therefore
   For models:
- MQTT (r=1): ~/models/<model id>/<json version>/{s,u,c}/"{ timestamp, link }"
- FTP: ~/models/<model id>/<json version>/{s,u,c}/<timestamp>.json

Files:
- FTP: ~/files/<poster id>/<format>/<timestamp>.extension

Messages:
- MQTT (r=0): ~/messages/<sender id>/<receiver id>/json/<json version>/{" json "}

 *************************************************************************************/

