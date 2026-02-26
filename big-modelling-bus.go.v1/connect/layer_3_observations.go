/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Connect
 * Component: Layer 3 - Observation
 *
 * This module implements the observations related functionality of the modelling bus.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 05.12.2025
 *
 */

package connect

import (
	"github.com/erikproper/big-modelling-bus.go.v1/generics"
)

/*
 * Defining constants
 */

const (
	rawObservationsPathElement      = "observations/raw"
	jsonObservationsPathElement     = "observations/json"
	streamedObservationsPathElement = "observations/streamed"
)

/*
 * Defining topic paths
 */

// Defining the topic path for raw oservations
func (b *TModellingBusConnector) rawObservationsTopicPath(observationID string) string {
	return rawObservationsPathElement +
		"/" + observationID
}

// Defining the topic path for JSON oservations
func (b *TModellingBusConnector) jsonObservationsTopicPath(observationID string) string {
	return jsonObservationsPathElement +
		"/" + observationID
}

// Defining the topic path for streamed oservations
func (b *TModellingBusConnector) streamedObservationsTopicPath(observationID string) string {
	return streamedObservationsPathElement +
		"/" + observationID
}

/*
 *
 * Externally visible functionality
 *
 */

/*
 * Posting observations
 */

// Posting a raw observation to the modelling bus
func (b *TModellingBusConnector) PostRawObservation(observationID, localFilePath string) {
	b.postFile(b.rawObservationsTopicPath(observationID), localFilePath, generics.GetTimestamp())
}

// Posting a JSON observation to the modelling bus
func (b *TModellingBusConnector) PostJSONObservation(observationID string, json []byte) {
	b.postJSONAsFile(b.jsonObservationsTopicPath(observationID), json, generics.GetTimestamp())
}

// Posting a streamed observation to the modelling bus
func (b *TModellingBusConnector) PostStreamedObservation(observationID string, json []byte) {
	b.postJSONAsStreamed(b.agentID, b.streamedObservationsTopicPath(observationID), json, generics.GetTimestamp())
}

/*
 * Listening to observations related postings
 */

// Listen for raw observation postings on the modelling bus
func (b *TModellingBusConnector) ListenForRawObservationPostings(agentID, observationID string, postingHandler func(string)) {
	b.listenForFilePostings(agentID, b.rawObservationsTopicPath(observationID), generics.JSONFileName, func(localFilePath, _ string) {
		postingHandler(localFilePath)
	})
}

// Listen for JSON observation postings on the modelling bus
func (b *TModellingBusConnector) ListenForJSONObservationPostings(agentID, observationID string, postingHandler func([]byte, string)) {
	b.listenForFilePostings(agentID, b.jsonObservationsTopicPath(observationID), generics.JSONFileName, func(localFilePath, timestamp string) {
		postingHandler(b.getJSONFromTemporaryFile(localFilePath, timestamp))
	})
}

// Listen for streamed observation postings on the modelling bus
func (b *TModellingBusConnector) ListenForStreamedObservationPostings(agentID, observationID string, postingHandler func([]byte, string)) {
	b.listenForStreamedPostings(agentID, b.streamedObservationsTopicPath(observationID), postingHandler)
}

/*
 * Retrieving observations
 */

// Retrieve raw observations from the modelling bus
func (b *TModellingBusConnector) GetRawObservation(agentID, observationID, localFileName string) (string, string) {
	return b.getFileFromPosting(agentID, b.rawObservationsTopicPath(observationID), localFileName)
}

// Retrieve JSON observations from the modelling bus
func (b *TModellingBusConnector) GetJSONObservation(agentID, observationID string) ([]byte, string) {
	return b.getJSON(agentID, b.jsonObservationsTopicPath(observationID))
}

// Retrieve streamed observations from the modelling bus
func (b *TModellingBusConnector) GetStreamedObservation(agentID, observationID string) ([]byte, string) {
	return b.getStreamedEvent(agentID, b.streamedObservationsTopicPath(observationID))
}

/*
 * Deleting observations
 */

// Delete raw observations from the modelling bus
func (b *TModellingBusConnector) DeleteRawObservation(observationID string) {
	b.deletePosting(b.rawObservationsTopicPath(observationID))
}

// Delete JSON observations from the modelling bus
func (b *TModellingBusConnector) DeleteJSONObservation(observationID string) {
	b.deletePosting(b.jsonObservationsTopicPath(observationID))
}

// Delete streamed observations from the modelling bus
func (b *TModellingBusConnector) DeleteStreamedObservation(observationID string) {
	b.deletePosting(b.streamedObservationsTopicPath(observationID))
}
