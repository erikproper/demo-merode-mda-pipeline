/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Generic
 * Component: Constants
 *
 * This component provides key constants used by the BIG Modelling Bus code
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Author: 27.11.2025
 *
 */

package generics

/*
 * Defining key global constants
 */

const (
	ModellingBusVersion = "bus-version-1.0"         // The current version of the BIG modelling bus.
	PayloadFileName     = "payload"                 // Name of the file used to store the "payload" of artefacts on the FTP server.
	JSONExtension       = ".json"                   // Extension for JSON files
	JSONFileName        = "message" + JSONExtension // Name of the local file used to (temporarily) represent upload/downloaded JSONs.
)
