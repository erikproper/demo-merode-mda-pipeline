/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Generic
 * Component: JSON Operations
 *
 * This component provides the functionality compute differences between JSONs as well as apply patches.
 * The differences/patches are compliant to the https://datatracker.ietf.org/doc/html/rfc6902 standard.
 * This component gladly uses the functionality provided by "github.com/evanphx/json-patch" and "github.com/wI2L/jsondiff"
 * Nevertheless, having our own Diff and Patch functions makes the rest of the code less dependent on potential changes to
 * the latter two packages.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 29.11.2025
 *
 */

package generics

import (
	"encoding/json"

	jsonpatch "github.com/evanphx/json-patch"
	"github.com/wI2L/jsondiff"
)

// JSONDiff computes the difference between two JSONs and returns it as a JSON Patch.
func JSONDiff(sourceJSON, targetJSON []byte) (json.RawMessage, error) {
	deltaOperations, err := jsondiff.CompareJSON(sourceJSON, targetJSON)
	if err != nil {
		return nil, err
	}

	return json.Marshal(deltaOperations)
}

// JSONApplyPatch applies a JSON Patch to a source JSON and returns the resulting JSON.
func JSONApplyPatch(sourceJSON, patchJSON []byte) (json.RawMessage, error) {
	patch, err := jsonpatch.DecodePatch(patchJSON)
	if err != nil {
		return nil, err
	}

	return patch.Apply(sourceJSON)
}

// IsJSON checks whether the message is a valid JSON.
func IsJSON(message []byte) bool {
	return json.Unmarshal(message, &json.RawMessage{}) == nil
}
