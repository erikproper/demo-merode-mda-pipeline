/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Connect
 * Component: Layer 2 - Basic Modelling Bus
 *
 * This component provides the basic functionality of the BIG Modelling Bus.
 * It combines the functionality of the:
 *   Layer 1 - Events Connector
 *   Layer 1 - Repository Connector
 * comonents to provide a higher-level interface to the BIG Modelling Bus.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 12.12.2025
 *
 */

package connect

import (
	"encoding/json"
	"os"

	"github.com/erikproper/big-modelling-bus.go.v1/generics"
)

/*
 * Defining the modelling bus connector
 */

type (
	TModellingBusConnector struct {
		modellingBusRepositoryConnector *tModellingBusRepositoryConnector // The repository connector
		modellingBusEventsConnector     *tModellingBusEventsConnector     // The events connector

		agentID       string // The Agent ID to be used in postings on the BIG Modelling Bus
		environmentID string // The Modelling environment ID

		Reporter   *generics.TReporter   // The Reporter to be used to report progress, error, and panics
		configData *generics.TConfigData // The configuration data to be used
	}
)

/*
 * Defining streamed events
 */

type (
	tStreamedEvent struct {
		Timestamp string          `json:"timestamp"` // Timestamp of the event
		Payload   json.RawMessage `json:"payload"`   // The actual payload of the streamed event
	}
)

/*
 * Posting things
 */

// Posting a file to the repository and announcing it on the modelling bus
func (b *TModellingBusConnector) postFile(topicPath, localFilePath, timestamp string) {
	// First, add the file to the repository
	event := b.modellingBusRepositoryConnector.addFile(topicPath, localFilePath, timestamp)

	// Then convert the event to JSON
	message, err := json.Marshal(event)

	// Post the event, if no error occurred during marshalling
	b.modellingBusEventsConnector.maybePostEvent(topicPath, message, "Something went wrong JSONing the file link data:", err)
}

// Posting a JSON message as a file to the repository and announcing it on the modelling bus
func (b *TModellingBusConnector) postJSONAsFile(topicPath string, jsonMessage []byte, timestamp string) {
	// First, add the JSON as a file to the repository
	event := b.modellingBusRepositoryConnector.addJSONAsFile(topicPath, jsonMessage, timestamp)

	// Then convert the event to JSON
	message, err := json.Marshal(event)

	// Post the event, if no error occurred during marshalling
	b.modellingBusEventsConnector.maybePostEvent(topicPath, message, "Something went wrong JSONing the file link data:", err)
}

// Posting a JSON message as a file to the modelling bus
func (b *TModellingBusConnector) maybePostJSONAsFile(topicPath string, jsonMessage []byte, timestamp, errorMessage string, err error) {
	// Handle potential errors
	if b.Reporter.MaybeReportError(errorMessage, err) {
		return
	}

	// Post JSON as a file
	b.postJSONAsFile(topicPath, jsonMessage, timestamp)
}

// Posting a JSON message as a streamed event on the modelling bus
func (b *TModellingBusConnector) postJSONAsStreamed(agentID, topicPath string, jsonMessage []byte, timestamp string) {
	// Create the streamed event
	event := tStreamedEvent{}
	event.Timestamp = timestamp
	event.Payload = jsonMessage

	// Convert the event to JSON
	message, err := json.Marshal(event)

	// Post the event, if no error occurred during marshalling
	b.modellingBusEventsConnector.maybePostTargetedEvent(agentID, topicPath, message, "Something went wrong JSONing the file link data:", err)
}

/*
 * Retrieving things
 */

// Get a linked file from the repository, given the message from the modelling bus
func (b *TModellingBusConnector) getLinkedFileFromRepository(message []byte, localFileName string) (string, string) {
	// If no message is given, return empty values
	if len(message) == 0 {
		return "", ""
	}

	// Unmarshal the message to get the repository event
	event := tRepositoryEvent{}
	err := json.Unmarshal(message, &event)

	// Handle potential errors
	if b.Reporter.MaybeReportError("Something went wrong unmarshalling the repository event:", err) {
		return "", ""
	}

	return b.modellingBusRepositoryConnector.getFile(event, localFileName), event.Timestamp
}

func (b *TModellingBusConnector) getFileFromMessage(message []byte, localFileName string) (string, string) {
	// Retrieve the file, as referred to in the message, from the repository
	return b.getLinkedFileFromRepository(message, localFileName)
}

// Get a linked file from a posting on the modelling bus
func (b *TModellingBusConnector) getFileFromPosting(agentID, topicPath, localFileName string) (string, string) {
	// Get the message from the modelling bus, and retrieve the file from the repository
	return b.getFileFromMessage(b.modellingBusEventsConnector.messageFromEvent(agentID, topicPath), localFileName)
}

// Get JSON from a temporary file
func (b *TModellingBusConnector) getJSONFromTemporaryFile(tempFilePath, timestamp string) ([]byte, string) {
	// Read the JSON payload from the temporary file
	jsonPayload, err := os.ReadFile(tempFilePath)
	os.Remove(tempFilePath)

	// Handle potential errors
	if err != nil {
		b.Reporter.ReportError("Something went wrong while retrieving the file:", err)
		b.Reporter.Error("Temporary file to be opened: %s", tempFilePath)
		return []byte{}, ""
	}

	// Return the JSON payload and timestamp
	return jsonPayload, timestamp
}

// Get JSON from the repository, given a posting on the modelling bus
func (b *TModellingBusConnector) getJSON(agentID, topicPath string) ([]byte, string) {
	// Get the linked file from the repository
	tempFilePath, timestamp := b.getLinkedFileFromRepository(b.modellingBusEventsConnector.messageFromEvent(agentID, topicPath), generics.JSONFileName)

	// Read the JSON payload from the temporary file
	jsonPayload, err := os.ReadFile(tempFilePath)
	os.Remove(tempFilePath)

	// Handle potential errors silently
	if err != nil {
		return []byte{}, ""
	}

	// Return the JSON payload and timestamp
	return jsonPayload, timestamp
}

// Split a streamed event from the message into Payload and Timestamp
func (b *TModellingBusConnector) splitStreamedEventFromMessage(message []byte) ([]byte, string) {
	// Unmarshal the message
	event := tStreamedEvent{}
	err := json.Unmarshal(message, &event)

	// Handle potential errors
	if b.Reporter.MaybeReportError("Something went wrong unmarshalling the streamed event:", err) {
		return []byte{}, ""
	}

	// Return the payload and timestamp
	return event.Payload, event.Timestamp
}

// Get the message from the modelling bus
func (b *TModellingBusConnector) getStreamedEvent(agentID, topicPath string) ([]byte, string) {
	return b.splitStreamedEventFromMessage(b.modellingBusEventsConnector.messageFromEvent(agentID, topicPath))
}

/*
 * Listening for postings
 */

// Listen for raw file postings on the modelling bus
func (b *TModellingBusConnector) listenForFilePostings(agentID, topicPath, localFileName string, postingHandler func(string, string)) {
	// Listen for raw file related events on the modelling bus
	b.modellingBusEventsConnector.listenForEvents(agentID, topicPath, func(message []byte) {
		postingHandler(b.getLinkedFileFromRepository(message, localFileName))
	})
}

// Listen for JSON file postings on the modelling bus
func (b *TModellingBusConnector) listenForJSONFilePostings(agentID, topicPath string, postingHandler func([]byte, string)) {
	// Listen for JSON file related events on the modelling bus
	b.modellingBusEventsConnector.listenForEvents(agentID, topicPath, func(message []byte) {
		postingHandler(b.getJSONFromTemporaryFile(b.getLinkedFileFromRepository(message, generics.JSONFileName)))
	})
}

// Listen for streamed postings on the modelling bus
func (b *TModellingBusConnector) listenForStreamedPostings(agentID, topicPath string, postingHandler func([]byte, string)) {
	// Listen for streamed events on the modelling bus
	b.modellingBusEventsConnector.listenForEvents(agentID, topicPath, func(message []byte) {
		postingHandler(b.splitStreamedEventFromMessage(message))
	})
}

/*
 * Deleting postings
 */

// Delete postings
func (b *TModellingBusConnector) deletePosting(topicPath string) {
	// Delete the posting both from the modelling bus and the repository
	b.modellingBusEventsConnector.deletePostingPath(topicPath)
	b.modellingBusRepositoryConnector.deletePostingPath(topicPath)
}

/*
 *
 * Externally visible functionality
 *
 */

// Delete a given environment
func (b *TModellingBusConnector) DeleteEnvironment(environment ...string) {
	// Determine the environment to delete
	// This could be the present environment, or the specified one
	environmentToDelete := b.environmentID
	if len(environment) > 0 {
		environmentToDelete = environment[0]
	}

	// Report on the deletion
	b.Reporter.Progress(1, "Deleting environment: %s", environmentToDelete)

	// Delete the environment both from the modelling bus and the repository
	b.modellingBusEventsConnector.deleteEnvironment(environmentToDelete)
	b.modellingBusRepositoryConnector.deleteEnvironment(environmentToDelete)
}

// Create the modelling bus connector
func CreateModellingBusConnector(configData *generics.TConfigData, reporter *generics.TReporter, postingOnly bool) TModellingBusConnector {
	// Create the modelling bus connector struct
	modellingBusConnector := TModellingBusConnector{}
	modellingBusConnector.environmentID = configData.GetValue("", "environment").String()
	modellingBusConnector.agentID = configData.GetValue("", "agent").String()
	modellingBusConnector.configData = configData
	modellingBusConnector.Reporter = reporter

	// Create the repository connector
	modellingBusConnector.modellingBusRepositoryConnector =
		createModellingBusRepositoryConnector(
			modellingBusConnector.environmentID,
			modellingBusConnector.agentID,
			modellingBusConnector.configData,
			modellingBusConnector.Reporter)

	// Create the events connector
	modellingBusConnector.modellingBusEventsConnector =
		createModellingBusEventsConnector(
			modellingBusConnector.environmentID,
			modellingBusConnector.agentID,
			modellingBusConnector.configData,
			modellingBusConnector.Reporter,
			postingOnly)

	// Return the created modelling bus connector
	return modellingBusConnector
}
