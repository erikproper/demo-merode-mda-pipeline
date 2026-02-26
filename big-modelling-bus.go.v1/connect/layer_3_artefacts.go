/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Connect
 * Component: Layer 3 - Artefacts
 *
 * This component provides the functionality to manage artefacts on the BIG Modelling Bus.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 05.12.2025
 *
 */

package connect

import (
	"encoding/json"

	"github.com/erikproper/big-modelling-bus.go.v1/generics"
)

/*
 * Defining constants
 */

const (
	jsonArtefactsPathElement = "artefacts/json" // JSON artefacts path element
	rawArtefactsPathElement  = "artefacts/raw"  // Raw artefacts path element

	artefactStatePathElement       = "state"       // Artefact state path element
	artefactConsideringPathElement = "considering" // Artefact considering path element
	artefactUpdatePathElement      = "update"      // Artefact update path element
)

/*
 * Defining the artefact connector
 */

type (
	TModellingBusArtefactConnector struct {
		ModellingBusConnector TModellingBusConnector // The modelling bus connector to be used
		JSONVersion           string                 `json:"json version, omitempty"`      // The JSON version to be used
		ArtefactID            string                 `json:"artefact id"`                  // The artefact ID
		CurrentTimestamp      string                 `json:"current timestamp, omitempty"` // The current versions' timestamp
		UpdatedTimestamp      string                 `json:"-"`                            // The updated version's timestamp
		ConsideredTimestamp   string                 `json:"-"`                            // The considered version's timestamp

		CurrentContent    json.RawMessage `json:"content, omitempty"` // The current content of the artefact
		UpdatedContent    json.RawMessage `json:"-"`                  // The updated content of the artefact
		ConsideredContent json.RawMessage `json:"-"`                  // The considered content of the artefact

		// Before we can communicate updates or considering postings, we must have
		// communicated the state of the model first
		stateCommunicated bool `json:"-"` // Identifies whether the state has been communicated
	}
)

/*
 * Defining topic paths
 */

// Defining topic paths for raw artefacts
func (b *TModellingBusArtefactConnector) rawArtefactsTopicPath(artefactID string) string {
	return rawArtefactsPathElement +
		"/" + artefactID
}

// Defining topic paths for json artefacts
func (b *TModellingBusArtefactConnector) jsonArtefactsTopicPath(artefactID string) string {
	return jsonArtefactsPathElement +
		"/" + artefactID +
		"/" + b.JSONVersion
}

// Defining topic paths for json artefact states
func (b *TModellingBusArtefactConnector) jsonArtefactsStateTopicPath(artefactID string) string {
	return b.jsonArtefactsTopicPath(artefactID) +
		"/" + artefactStatePathElement
}

// Defining topic paths for json artefact updates
func (b *TModellingBusArtefactConnector) jsonArtefactsUpdateTopicPath(artefactID string) string {
	return b.jsonArtefactsTopicPath(artefactID) +
		"/" + artefactUpdatePathElement
}

// Defining topic paths for json considered artefact changes
func (b *TModellingBusArtefactConnector) jsonArtefactsConsideringTopicPath(artefactID string) string {
	return b.jsonArtefactsTopicPath(artefactID) +
		"/" + artefactConsideringPathElement
}

/*
 * Managing JSON artefacts
 */

// Defining JSON delta
type TJSONDelta struct {
	Operations       json.RawMessage `json:"operations"`        // The JSON delta operations
	Timestamp        string          `json:"timestamp"`         // Timestamp of the delta
	CurrentTimestamp string          `json:"current timestamp"` // The current timestamp at the sender side
}

// Posting JSON delta
func (b *TModellingBusArtefactConnector) postJSONDelta(deltaTopicPath string, oldStateJSON, newStateJSON []byte) {
	// Create the delta
	deltaOperationsJSON, err := generics.JSONDiff(oldStateJSON, newStateJSON)

	// Handle potential errors
	if b.ModellingBusConnector.Reporter.MaybeReportError("Something went wrong running the JSON diff:", err) {
		return
	}

	// Create the delta object
	delta := TJSONDelta{}
	delta.Timestamp = generics.GetTimestamp()
	delta.CurrentTimestamp = b.CurrentTimestamp
	delta.Operations = deltaOperationsJSON

	// Convert the delta to JSON
	deltaJSON, err := json.Marshal(delta)

	// Post the delta JSON, if no error occurred during marshalling
	b.ModellingBusConnector.maybePostJSONAsFile(deltaTopicPath, deltaJSON, delta.Timestamp, "Something went wrong JSONing the diff patch:", err)
}

// Applying a JSON delta to a given current JSON state
func (b *TModellingBusArtefactConnector) applyJSONDelta(currentJSONState json.RawMessage, deltaJSON []byte) (json.RawMessage, string, bool) {
	// Unmarshal the delta
	delta := TJSONDelta{}
	err := json.Unmarshal(deltaJSON, &delta)

	// Handle potential errors
	if b.ModellingBusConnector.Reporter.MaybeReportError("Something went wrong unJSONing the received diff patch:", err) {
		return currentJSONState, b.CurrentTimestamp, false
	}

	// Check whether the delta can be applied
	if delta.CurrentTimestamp != b.CurrentTimestamp {
		// When the timestamps don't match, we cannot apply the delta
		return currentJSONState, b.CurrentTimestamp, false
	}

	// Apply the delta
	newJSONState, err := generics.JSONApplyPatch(currentJSONState, delta.Operations)

	// Handle potential errors
	if b.ModellingBusConnector.Reporter.MaybeReportError("Applying the diff patch did not work:", err) {
		return currentJSONState, b.CurrentTimestamp, false
	}

	// Return the new state
	return newJSONState, delta.Timestamp, true
}

// Updating the current JSON artefact state
func (b *TModellingBusArtefactConnector) updateCurrentJSONArtefact(json []byte, currentTimestamp string) {
	// Update the current JSON artefact state
	b.CurrentContent = json
	b.UpdatedContent = json
	b.ConsideredContent = json

	b.CurrentTimestamp = currentTimestamp
	b.UpdatedTimestamp = currentTimestamp
	b.ConsideredTimestamp = currentTimestamp
}

// Updating the updated JSON artefact state
func (b *TModellingBusArtefactConnector) updateUpdatedJSONArtefact(json []byte, _ string) bool {
	// If the json is empty, then the updated state, and considered state, are the same as the current state
	if len(json) == 0 {
		b.UpdatedContent = b.CurrentContent
		b.ConsideredContent = b.CurrentContent

		b.UpdatedTimestamp = b.CurrentTimestamp
		b.ConsideredTimestamp = b.CurrentTimestamp

		return true
	}

	// Apply the delta to the current content
	ok := false
	b.UpdatedContent, b.UpdatedTimestamp, ok = b.applyJSONDelta(b.CurrentContent, json)
	if ok {
		b.ConsideredContent = b.UpdatedContent
		b.ConsideredTimestamp = b.UpdatedTimestamp
	}

	// Return whether the update was successful
	return ok
}

// Updating the considered JSON artefact state
func (b *TModellingBusArtefactConnector) updateConsideringJSONArtefact(json []byte, _ string) bool {
	// If the json is empty, then the considered state is the same as the updated state
	if len(json) == 0 {
		b.ConsideredContent = b.UpdatedContent
		b.ConsideredTimestamp = b.UpdatedTimestamp

		return true
	}

	// Apply the delta to the updated content
	ok := false
	b.ConsideredContent, b.ConsideredTimestamp, ok = b.applyJSONDelta(b.UpdatedContent, json)

	// Return whether the update was successful
	return ok
}

/*
 *
 * Externally visible functionality
 *
 */

/*
 * Posting artefacts
 */

// Posting raw artefact state
func (b *TModellingBusArtefactConnector) PostRawArtefactState(localFilePath string) {
	// Post the raw artefact state
	b.ModellingBusConnector.postFile(b.rawArtefactsTopicPath(b.ArtefactID), localFilePath, generics.GetTimestamp())
}

// Posting JSON artefact state
func (b *TModellingBusArtefactConnector) PostJSONArtefactState(stateJSON []byte, okJSONing bool) {
	// If not ok, then do not proceed
	if !okJSONing {
		return
	}

	// Post the JSON artefact state
	b.CurrentTimestamp = generics.GetTimestamp()
	b.CurrentContent = stateJSON
	b.UpdatedContent = stateJSON
	b.ConsideredContent = stateJSON
	b.ModellingBusConnector.postJSONAsFile(b.jsonArtefactsStateTopicPath(b.ArtefactID), b.CurrentContent, b.CurrentTimestamp)

	// Mark that the state has been communicated
	b.stateCommunicated = true
}

// Posting JSON artefact update
func (b *TModellingBusArtefactConnector) PostJSONArtefactUpdate(updatedStateJSON []byte, okJSONing bool) {
	// If not ok, then do not proceed
	if !okJSONing {
		return
	}

	// Ensure the state has been communicated
	if !b.stateCommunicated {
		b.PostJSONArtefactState(updatedStateJSON, okJSONing)
	}

	// Post the JSON artefact update
	b.UpdatedContent = updatedStateJSON
	b.ConsideredContent = updatedStateJSON
	b.postJSONDelta(b.jsonArtefactsUpdateTopicPath(b.ArtefactID), b.CurrentContent, b.UpdatedContent)
}

// Posting JSON considered artefact
func (b *TModellingBusArtefactConnector) PostJSONArtefactConsidering(consideringStateJSON []byte, okJSONing bool) {
	// If not ok, then do not proceed
	if !okJSONing {
		return
	}

	// Ensure the state has been communicated
	if !b.stateCommunicated {
		b.PostJSONArtefactState(b.CurrentContent, okJSONing)
	}

	// Post the JSON considered artefact
	b.ConsideredContent = consideringStateJSON

	// Post the JSON considered artefact
	b.postJSONDelta(b.jsonArtefactsConsideringTopicPath(b.ArtefactID), b.UpdatedContent, b.ConsideredContent)
}

/*
 * Listening to artefact related postings
 */

// Listening for raw artefact state postings
func (b *TModellingBusArtefactConnector) ListenForRawArtefactStatePostings(agentID, artefactID, fileName string, postingHandler func(string, string)) {
	// Listen for raw artefact state postings
	b.ModellingBusConnector.listenForFilePostings(agentID, b.rawArtefactsTopicPath(artefactID), fileName, postingHandler)
}

// Listening for JSON artefact state postings
func (b *TModellingBusArtefactConnector) ListenForJSONArtefactStatePostings(agentID, artefactID string, handler func()) {
	// Listen for JSON artefact state postings
	b.ModellingBusConnector.listenForJSONFilePostings(agentID, b.jsonArtefactsStateTopicPath(artefactID), func(json []byte, timestamp string) {
		b.updateCurrentJSONArtefact(json, timestamp)
		handler()
	})
}

// Listening for JSON artefact update postings
func (b *TModellingBusArtefactConnector) ListenForJSONArtefactUpdatePostings(agentID, artefactID string, handler func()) {
	// Listen for JSON artefact update postings
	b.ModellingBusConnector.listenForJSONFilePostings(agentID, b.jsonArtefactsUpdateTopicPath(artefactID), func(json []byte, timestamp string) {
		if b.updateUpdatedJSONArtefact(json, timestamp) {
			handler()
		}
	})
}

// Listening for JSON considered artefact postings
func (b *TModellingBusArtefactConnector) ListenForJSONArtefactConsideringPostings(agentID, artefactID string, handler func()) {
	// Listen for JSON considered artefact postings
	b.ModellingBusConnector.listenForJSONFilePostings(agentID, b.jsonArtefactsConsideringTopicPath(artefactID), func(json []byte, timestamp string) {
		if b.updateConsideringJSONArtefact(json, timestamp) {
			handler()
		}
	})
}

/*
 * Retrieving artefact states
 */

// Getting raw artefact state
func (b *TModellingBusArtefactConnector) GetRawArtefact(agentID, artefactID, localFileName string) (string, string) {
	// Get the raw artefact state
	return b.ModellingBusConnector.getFileFromPosting(agentID, b.rawArtefactsTopicPath(artefactID), localFileName)
}

// Getting JSON artefact state
func (b *TModellingBusArtefactConnector) GetJSONArtefactState(agentID, artefactID string) {
	// Update the current JSON artefact state
	b.updateCurrentJSONArtefact(b.ModellingBusConnector.getJSON(agentID, b.jsonArtefactsStateTopicPath(artefactID)))
}

// Getting JSON artefact update
func (b *TModellingBusArtefactConnector) GetJSONArtefactUpdate(agentID, artefactID string) {
	// Get the JSON artefact update
	b.GetJSONArtefactState(agentID, artefactID)

	// Update the updated JSON artefact state
	b.updateUpdatedJSONArtefact(b.ModellingBusConnector.getJSON(agentID, b.jsonArtefactsUpdateTopicPath(artefactID)))
}

// Getting JSON artefact considering
func (b *TModellingBusArtefactConnector) GetJSONArtefactConsidering(agentID, artefactID string) {
	// Get the JSON artefact update
	b.GetJSONArtefactUpdate(agentID, artefactID)

	// Update the considered JSON artefact state
	b.updateConsideringJSONArtefact(b.ModellingBusConnector.getJSON(agentID, b.jsonArtefactsConsideringTopicPath(artefactID)))
}

/*
 * Deleting artefacts
 */

// Deleting raw artefact
func (b *TModellingBusArtefactConnector) DeleteRawArtefact(artefactID string) {
	// Delete the raw artefact
	b.ModellingBusConnector.deletePosting(b.rawArtefactsTopicPath(artefactID))
}

// Deleting JSON artefact
func (b *TModellingBusArtefactConnector) DeleteJSONArtefact(artefactID string) {
	// Delete the JSON artefact
	b.ModellingBusConnector.deletePosting(b.jsonArtefactsStateTopicPath(artefactID))
	b.ModellingBusConnector.deletePosting(b.jsonArtefactsUpdateTopicPath(artefactID))
	b.ModellingBusConnector.deletePosting(b.jsonArtefactsConsideringTopicPath(artefactID))
}

/*
 * Creating
 */

// Creating a modelling bus artefact connector
func CreateModellingBusArtefactConnector(ModellingBusConnector TModellingBusConnector, JSONVersion, ArtefactID string) TModellingBusArtefactConnector {
	// Create the modelling bus artefact connector
	ModellingBusArtefactConnector := TModellingBusArtefactConnector{}
	ModellingBusArtefactConnector.ModellingBusConnector = ModellingBusConnector
	ModellingBusArtefactConnector.JSONVersion = JSONVersion
	ModellingBusArtefactConnector.ArtefactID = ArtefactID
	ModellingBusArtefactConnector.CurrentContent = []byte{}
	ModellingBusArtefactConnector.UpdatedContent = []byte{}
	ModellingBusArtefactConnector.ConsideredContent = []byte{}
	ModellingBusArtefactConnector.CurrentTimestamp = generics.GetTimestamp()
	ModellingBusArtefactConnector.UpdatedTimestamp = ModellingBusArtefactConnector.CurrentTimestamp
	ModellingBusArtefactConnector.ConsideredTimestamp = ModellingBusArtefactConnector.CurrentTimestamp
	ModellingBusArtefactConnector.stateCommunicated = false

	// Return the created modelling bus artefact connector
	return ModellingBusArtefactConnector
}
