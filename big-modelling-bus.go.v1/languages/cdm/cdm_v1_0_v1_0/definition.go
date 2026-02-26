/*
 *
 * Module:    BIG Modelling Bus
 * Package:   Languages/Conceptual Domain Modelling, Version 1
 * Component: Definition
 *
 * This component provides the core fefinitions of the
 *    Conceptual Domain Modelling language, Version 1
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 15.12.2025
 *
 */

package cdm_v1_0_v1_0

import (
	"encoding/json"

	"github.com/erikproper/big-modelling-bus.go.v1/connect"
	"github.com/erikproper/big-modelling-bus.go.v1/generics"
)

/*
 * Defining key constants
 */

const (
	// The JSON version identifier for CDM models:
	// - Meta model version 1.0
	// - JSON version 1.0
	ModelJSONVersion = "cdm-v1.0-v1.0" // The JSON version identifier for CDM v1.0-v1.0 models
)

/*
 * Defining the CDM model structure, including the JSON structure
 */

type (
	// Definition of a relation type reading
	TRelationReading struct {
		InvolvementTypes []string `json:"involvement types"` // The involvement types used in the relation type readings
		ReadingElements  []string `json:"reading elements"`  // The strings used in relation type reading
	}

	// Definition of the CDM model structure
	TCDMModel struct {
		// For reporting errors
		reporter *generics.TReporter // The Reporter to be used to report progress, errors, and panics

		// For posting of, and listening to, model updates on the modelling bus
		ModelListener connect.TModellingBusArtefactConnector `json:"-"` // The Modelling Bus Artefact Poster used to listen for updates of the model

		// General properties for the model
		ModelName       string `json:"model name"` // The name of the model
		InstanceIDCount int    `json:"-"`          // The counter for instance IDs

		// For types
		TypeName map[string]string `json:"type names"` // The names of the types, by their IDs

		// For concrete individual types
		ConcreteIndividualTypes map[string]bool `json:"concrete individual types"` // The concrete individual types

		// For quality types
		QualityTypes        map[string]bool   `json:"quality types"`            // The quality types
		DomainOfQualityType map[string]string `json:"domains of quality types"` // The domain of each quality type

		// For involvement types
		InvolvementTypes              map[string]bool   `json:"involvement types"`                   // The involvement types
		BaseTypeOfInvolvementType     map[string]string `json:"base types of involvement types"`     // The base type of each involvement type
		RelationTypeOfInvolvementType map[string]string `json:"relation types of involvement types"` // The relation type of each involvement type

		// For relation types
		RelationTypes                     map[string]bool             `json:"relation types"`                         // The relation types
		InvolvementTypesOfRelationType    map[string]map[string]bool  `json:"involvement types of relation types"`    // The involvement types of each relation type
		AlternativeReadingsOfRelationType map[string]map[string]bool  `json:"alternative readings of relation types"` // The alternative readings of each relation type
		PrimaryReadingOfRelationType      map[string]string           `json:"primary readings of relation types"`     // The primary reading of each relation type
		ReadingDefinition                 map[string]TRelationReading `json:"reading definition"`                     // The definition of each relation type reading
	}
)

/*
 * Converting JSON to models and back
 */

// Converting the model to JSON
func (m *TCDMModel) GetModelAsJSON() (json.RawMessage, bool) {
	// Converting the model to JSON
	json, err := json.Marshal(m)

	// Handle potential errors
	if m.reporter.MaybeReportError("Something went wrong when converting model to JSON.", err) {
		return []byte{}, false
	}

	return json, true
}

// Converting the JSON to the model
func (m *TCDMModel) SetModelFromJSON(modelJSON json.RawMessage) bool {
	m.Clean()
	err := json.Unmarshal(modelJSON, m)

	// Handle potential errors
	if m.reporter.MaybeReportError("Something went wrong when converting JSON to model.", err) {
		return false
	}

	return true
}

/*
 * Functionality related to the CDM model
 */

// Generating a new element ID
func (m *TCDMModel) NewElementID() string {
	// Generating a new element ID based on timestamps
	return generics.GetTimestamp()
}

// Setting the model name
func (m *TCDMModel) SetModelName(name string) {
	// Setting the model name
	m.ModelName = name
}

// Adding a concrete individual type
func (m *TCDMModel) AddConcreteIndividualType(name string) string {
	// Settings things up for a new concrete individual type
	id := m.NewElementID()
	m.ConcreteIndividualTypes[id] = true
	m.TypeName[id] = name

	// Return the new type ID
	return id
}

// Adding a quality type
func (m *TCDMModel) AddQualityType(name, domain string) string {
	// Settings things up for a new quality type
	id := m.NewElementID()
	m.QualityTypes[id] = true
	m.TypeName[id] = name
	m.DomainOfQualityType[id] = domain

	// Return the new type ID
	return id
}

// Adding an involvement type
func (m *TCDMModel) AddInvolvementType(name string, base string) string {
	// Settings things up for a new involvement type
	id := m.NewElementID()
	m.InvolvementTypes[id] = true
	m.TypeName[id] = name
	m.BaseTypeOfInvolvementType[id] = base

	// Return the new type ID
	return id
}

// Adding a relation type
func (m *TCDMModel) AddRelationType(name string, involvementTypes ...string) string {
	// Settings things up for a new relation type
	id := m.NewElementID()
	m.RelationTypes[id] = true
	m.TypeName[id] = name

	// Setting up the involvement types of this relation type
	m.InvolvementTypesOfRelationType[id] = map[string]bool{}
	for _, involvementType := range involvementTypes {
		m.RelationTypeOfInvolvementType[involvementType] = id
		m.InvolvementTypesOfRelationType[id][involvementType] = true
	}

	// Setting up the alternative readings of this relation type
	m.AlternativeReadingsOfRelationType[id] = map[string]bool{}

	// Return the new type ID
	return id
}

// Adding a relation type reading
func (m *TCDMModel) AddRelationTypeReading(relationType string, stringsAndInvolvementTypes ...string) string {
	// Creating the relation type reading
	reading := TRelationReading{}

	// Splitting the strings and involvement types
	// These should be given in an alternating manner
	// For an n-ary relation type, we should have:
	//    s_1, ..., s_{n+1} strings
	// that are part of the reading, and
	//    i_1, ..., i_n strings
	// referring to involvement types, which should be ordered as:
	//    s_1, i_1, s_2, i_2, ..., i_n, s_{n+1}
	//
	// Note: Technically, this function should require a check to see if all InvolvementTypesss of the relation
	// have been used ... and used only once
	// But ... as this is only "Hello World" for now, so we won't do so yet.
	//
	isReadingString := true
	for _, element := range stringsAndInvolvementTypes {
		if isReadingString {
			reading.ReadingElements = append(reading.ReadingElements, element)
		} else {
			reading.InvolvementTypes = append(reading.InvolvementTypes, element)
		}
		isReadingString = !isReadingString
	}

	// Adding the reading to the model
	readingID := m.NewElementID()
	m.AlternativeReadingsOfRelationType[relationType][readingID] = true
	m.ReadingDefinition[readingID] = reading

	// If this is the first reading for the relation type, then we will make it to be the primary reading
	if m.PrimaryReadingOfRelationType[relationType] == "" {
		m.PrimaryReadingOfRelationType[relationType] = readingID
	}

	// Return this reaading's Reading ID
	return readingID
}

/*
 * Creating & cleaning CDM models
 */

// Cleaning a CDM model
func (m *TCDMModel) Clean() {
	// Resetting all fields
	m.ModelName = ""
	m.ConcreteIndividualTypes = map[string]bool{}
	m.QualityTypes = map[string]bool{}
	m.RelationTypes = map[string]bool{}
	m.InvolvementTypes = map[string]bool{}
	m.TypeName = map[string]string{}
	m.DomainOfQualityType = map[string]string{}
	m.BaseTypeOfInvolvementType = map[string]string{}
	m.RelationTypeOfInvolvementType = map[string]string{}
	m.InvolvementTypesOfRelationType = map[string]map[string]bool{}
	m.AlternativeReadingsOfRelationType = map[string]map[string]bool{}
	m.PrimaryReadingOfRelationType = map[string]string{}
	m.ReadingDefinition = map[string]TRelationReading{}
}

// Creating a new CDM model
func CreateCDMModel(reporter *generics.TReporter) TCDMModel {
	// Create an empty CDM model
	CDMModel := TCDMModel{}
	CDMModel.Clean()

	// Setting up the reporter
	CDMModel.reporter = reporter

	// Return the created model
	return CDMModel
}
