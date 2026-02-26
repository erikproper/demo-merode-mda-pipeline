/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Generic
 * Component: Timestamps
 *
 * This component computes unique (within the present run-time environment) timestamps.
 * The uniqueness is based on the current time up to seconds, and is combined with a counter
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 27.11.2025
 *
 */

package generics

import (
	"fmt"
	"time"
)

/*
 * Defining key variables
 */

var (
	timestampCounter  int    // Counter to ensure uniqueness within the same second
	lastTimeTimestamp string // The last time-based part of the timestamp
)

/*
 * Defining timestamp functionality
 */

func GetTimestamp() string {
	// Getting the current time
	CurrenTime := time.Now()

	// Creating the time-based part of the timestamp
	timeTimestamp := fmt.Sprintf(
		"%04d-%02d-%02d-%02d-%02d-%02d",
		CurrenTime.Year(),
		CurrenTime.Month(),
		CurrenTime.Day(),
		CurrenTime.Hour(),
		CurrenTime.Minute(),
		CurrenTime.Second())

	// Updating the counter part of the timestamp
	if timeTimestamp == lastTimeTimestamp {
		// Same time as last time, so incrementing counter
		timestampCounter++
	} else {
		// Different time as last time, so resetting counter
		lastTimeTimestamp = timeTimestamp
		timestampCounter = 0
	}

	// Returning the timestamp
	return fmt.Sprintf("%s-%02d", lastTimeTimestamp, timestampCounter)
}

// Initializing timestamp functionality
func init() {
	timestampCounter = 0
	lastTimeTimestamp = ""
}
