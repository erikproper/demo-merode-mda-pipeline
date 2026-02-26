/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Connect
 * Component: Layer 1 - Events Connector
 *
 * This comonent provides the connectivity to the MQTT-based event bus.
 * Most functionality is intended as internal functionality to be used by the other components of this package.
 * Nevertheless, some functionality is externally visible.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 05.12.2025
 *
 */

package connect

import (
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/erikproper/big-modelling-bus.go.v1/generics"
)

/*
 * Defining the events connector
 */

type (
	tModellingBusEventsConnector struct {
		user          string // MQTT user
		port          string // MQTT port
		broker        string // MQTT broker
		prefix        string // MQTT topic prefix
		agentID       string // Agent ID to be used in postings on the MQTT bus
		password      string // MQTT password
		environmentID string // Modelling environment ID

		loadDelay int // Delay (in milliseconds) to allow messages to arrive from the MQTT bus

		connectionBeingOpenened bool // Whether the MQTT connection is still being opened.
		// The opening phase is special, as we need to collect all existing messages on the bus. CHECK!!!

		currentMessages map[string][]byte // Currently known messages on the MQTT bus
		openingMessages map[string][]byte // Messages known at the opening of the connection to the MQTT bus
		// We need this to enable deletion of topics, as well as to be able to pro-actively
		// pull information from the modelling bus

		client mqtt.Client // The MQTT client

		reporter *generics.TReporter // The Reporter to be used to report progress, errors, and panics
	}
)

/*
 * Defining topic roots and paths
 */

// Get the topic root for the given modelling environment
func (e *tModellingBusEventsConnector) mqttEnvironmentTopicRoot() string {
	return e.prefix + "/" + generics.ModellingBusVersion + "/" + e.environmentID
}

// Get the topic list for the given modelling environment
func (e *tModellingBusEventsConnector) mqttEnvironmentTopicListFor(environmentID string) string {
	return e.prefix + "/" + generics.ModellingBusVersion + "/" + environmentID + "/#"
}

// Get the topic root for the given modelling environment and agent
func (e *tModellingBusEventsConnector) mqttAgentTopicRootFor(environmentID, agentID string) string {
	return e.prefix + "/" + generics.ModellingBusVersion + "/" + environmentID + "/" + agentID
}

// Get the topic path for the given agent and topic path
func (e *tModellingBusEventsConnector) mqttAgentTopicPath(agentID, topicPath string) string {
	return e.prefix + "/" + generics.ModellingBusVersion + "/" + e.environmentID + "/" + agentID + "/" + topicPath
}

/*
 * Connecting to MQTT
 */

// Connection lost handler
func (e *tModellingBusEventsConnector) connectionLostHandler(c mqtt.Client, err error) {
	e.reporter.PanicError("MQTT connection lost.", err)
}

// Wait for a while to allow messages to arrive from the MQTT bus
func (e *tModellingBusEventsConnector) waitForMQTT() {
	// Report we're going to sleep
	e.reporter.Progress(generics.ProgressLevelDetailed, "Sleeping for %d miliseconds to collect information from the MQTT bus.", e.loadDelay)

	// Now sleep for a while
	time.Sleep(time.Duration(e.loadDelay) * time.Second / 1000)
}

// Report found topics
func (e *tModellingBusEventsConnector) reportFoundTopics() {
	// Report found topics
	if len(e.openingMessages) == 0 {
		// No topics found
		e.reporter.Progress(generics.ProgressLevelDetailed, "No topics found.")
	} else {
		// Topics found, so let's list them
		e.reporter.Progress(generics.ProgressLevelDetailed, "Found topic(s):")
		for topic := range e.openingMessages {
			if strings.HasPrefix(topic, e.mqttEnvironmentTopicRoot()) {
				e.reporter.Progress(generics.ProgressLevelDetailed, "- %s", topic)
			}
		}
	}
}

// Collect all MQTT topics for a given modelling environment
func (e *tModellingBusEventsConnector) collectTopicsForModellingEnvironment(environmentID string) {
	token := e.client.Subscribe(e.mqttEnvironmentTopicListFor(environmentID), 0, func(client mqtt.Client, msg mqtt.Message) {
		// Get topic and payload
		topic := msg.Topic()
		payload := msg.Payload()

		// Store the topic and payload
		if len(payload) == 0 {
			// If the payload is empty, the topic has been deleted
			delete(e.openingMessages, topic)
			delete(e.currentMessages, topic)
		} else {
			// Otherwise, store the message
			if e.connectionBeingOpenened {
				// During opening, we need to store both opening and current messages
				e.openingMessages[topic] = payload
				e.currentMessages[topic] = payload
			} else {
				// After opening, we only need to store current messages
				if _, defined := e.openingMessages[topic]; !defined {
					// If not yet defined, define the openingMessage fot this topic with empty payload
					e.openingMessages[topic] = []byte{}
				}
				e.currentMessages[topic] = payload
			}
		}
	})

	// Wait for the subscription to be in place
	token.Wait()

	// Wait for a while to allow messages to arrive from the MQTT bus
	e.waitForMQTT()

	// Report found topics
	e.reportFoundTopics()
}

// Connect to the MQTT broker
func (e *tModellingBusEventsConnector) connectToMQTT(postingOnly bool) {
	// Setting up MQTT connection options
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://" + e.broker + ":" + e.port)
	opts.SetUsername(e.user)
	opts.SetPassword(e.password)
	opts.SetConnectionLostHandler(e.connectionLostHandler)

	// Connecting to the MQTT broker
	connected := false
	for !connected {
		// Trying to connect
		e.reporter.Progress(generics.ProgressLevelBasic, "Trying to connect to the MQTT broker.")

		// Creating the MQTT client
		e.client = mqtt.NewClient(opts)
		token := e.client.Connect()
		token.Wait()

		// Checking for errors
		err := token.Error()
		if err != nil {
			e.reporter.ReportError("Error connecting to the MQTT broker:", err)

			time.Sleep(5 * time.Second)
		} else {
			connected = true
		}
	}

	// Initialising message storage
	e.openingMessages = map[string][]byte{}
	e.currentMessages = map[string][]byte{}
	if connected {
		e.reporter.Progress(generics.ProgressLevelBasic, "Connected to the MQTT broker.")

		if !postingOnly {
			// Unless we will be postingOnly, continuously connect all used topics underneath the
			// topic root, and their messages.
			// We need this information to enable deletion of topics, as well as to be able to
			// pro-actively pull information from the modelling bus
			e.collectTopicsForModellingEnvironment(e.environmentID)
		}

		// Mark the opening phase as finished
		e.connectionBeingOpenened = false
	}
}

/*
 *  Posting things
 */

// Post a message on a given topic path
func (e *tModellingBusEventsConnector) postMessage(topicPath string, message []byte) {
	// Posting the message
	token := e.client.Publish(topicPath, 0, true, string(message))
	token.Wait()
}

///// ALL needed??

// Post an event on a given topic path
func (e *tModellingBusEventsConnector) postTargetedEvent(agentID, topicPath string, message []byte) {
	// Posting the event message
	e.postMessage(e.mqttAgentTopicPath(agentID, topicPath), message)
}

// Post an event on a given topic path
func (e *tModellingBusEventsConnector) postEvent(topicPath string, message []byte) {
	// Posting the event message
	e.postMessage(e.mqttAgentTopicPath(e.agentID, topicPath), message)
}

///// ALL needed??

// Post an event on a given topic path, when there was no error
func (e *tModellingBusEventsConnector) maybePostEvent(topicPath string, eventMessage []byte, errorMessage string, err error) {
	// Handle potential errors
	if e.reporter.MaybeReportError(errorMessage, err) {
		return
	}

	// Post the event message
	e.postEvent(topicPath, eventMessage)
}

// Post an event on a given topic path, when there was no error
func (e *tModellingBusEventsConnector) maybePostTargetedEvent(agentID, topicPath string, eventMessage []byte, errorMessage string, err error) {
	// Handle potential errors
	if e.reporter.MaybeReportError(errorMessage, err) {
		return
	}

	// Post the event message
	e.postTargetedEvent(agentID, topicPath, eventMessage)
}

/*
 *  Retrieving things
 */

// Pro-actively get the (latest) message from the bus.
func (e *tModellingBusEventsConnector) messageFromEvent(agentID, topicPath string) []byte {
	// Getting the message
	mqttTopicPath := e.mqttAgentTopicPath(agentID, topicPath)

	// Getting the message
	message := e.currentMessages[mqttTopicPath]

	// When messageFromEvent is called too soon after opening the connection to the MQTT broker,
	// we may not have received a message yet. So, we need to be "waitForMQTT" patient.
	if len(message) == 0 {
		e.waitForMQTT()
		message = e.currentMessages[mqttTopicPath]
	}

	return message
}

/*
 *  Listening for events
 */

// Listen for events on a given topic path for a given agent
func (e *tModellingBusEventsConnector) listenForEvents(agentID, topicPath string, eventHandler func([]byte)) {
	// Getting the MQTT topic path
	mqttTopicPath := e.mqttAgentTopicPath(agentID, topicPath)

	// Setting up the subscription
	token := e.client.Subscribe(mqttTopicPath, 0, func(client mqtt.Client, msg mqtt.Message) {
		// Getting the payload
		payload := msg.Payload()

		// Calling the event handler, if necessary
		if len(payload) > 0 && string(e.openingMessages[mqttTopicPath]) != string(payload) {
			eventHandler(payload)
		}
	})

	// Waiting for the subscription to be in place
	token.Wait()
}

/*
 *  Deleting postings
 */

// Delete a given topic path
func (e *tModellingBusEventsConnector) deletePath(topicPath string) {
	// Deleting the path by posting an empty message
	e.postMessage(topicPath, []byte{})
}

// Delete a given topic path
func (e *tModellingBusEventsConnector) deletePostingPath(topicPath string) {
	// Deleting the path by posting an empty event
	e.postEvent(topicPath, []byte{})
}

// Delete all topics for a given modelling environment
func (e *tModellingBusEventsConnector) deleteEnvironment(environmentID string) {
	// Collect all topics for the given modelling environment
	e.collectTopicsForModellingEnvironment(environmentID)

	// Delete all topics for the given modelling environment
	for topic := range e.openingMessages {
		// Check whether the topic belongs to the given modelling environment
		if strings.HasPrefix(topic, e.mqttAgentTopicRootFor(environmentID, e.agentID)) {
			// Delete the topic
			e.deletePath(topic)
		}
	}
}

/*
 * Creating bus event connectors
 */

// Create a modelling bus events connector
func createModellingBusEventsConnector(environmentID, agentID string, configData *generics.TConfigData, reporter *generics.TReporter, postingOnly bool) *tModellingBusEventsConnector {
	// Creating the events connector
	e := tModellingBusEventsConnector{}

	// Get data from the config file
	e.port = configData.GetValue("mqtt", "port").String()
	e.user = configData.GetValue("mqtt", "user").String()
	e.broker = configData.GetValue("mqtt", "broker").String()
	e.password = configData.GetValue("mqtt", "password").String()
	e.prefix = configData.GetValue("mqtt", "prefix").String()
	e.loadDelay = configData.GetValue("mqtt", "load_delay").IntWithDefault(1)

	// Initialising other data
	e.connectionBeingOpenened = true
	e.currentMessages = map[string][]byte{}
	e.openingMessages = map[string][]byte{}
	e.agentID = agentID
	e.environmentID = environmentID
	e.reporter = reporter

	// Connect to MQTT
	e.connectToMQTT(postingOnly)

	// Return the created events connector
	return &e
}

/*
 *
 * Externally visible functionality
 *
 */

// Defining constants
const (
	// When creating an events connector only for posting, then use this constant to set this to true
	// In this case, the connector will not collect existing messages from the bus
	PostingOnly = true
)
