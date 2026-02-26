/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Generic
 * Component: Reporting
 *
 * This component is concerned with the reporting of errors, progress, etc, to the user.
 * For the moment, it only involves the reporting of progress and errors, including panics.
 *
 * Author: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 27.11.2025
 *
 */

package generics

import (
	"fmt"
)

/*
 * Defining reporting levels
 */

const (
	ProgressLevelBasic    = 1
	ProgressLevelDetailed = 2
	ProgressLevelNoisy    = 3
)

/*
 * Defining reporter types
 */

type (
	TErrorReporter    func(string)
	TProgressReporter func(string)

	TReporter struct {
		reportingLevel   int
		errorReporter    TErrorReporter
		progressReporter TProgressReporter
	}
)

/*
 * Defining reporter functionality
 */

// Reporting an error
func (r *TReporter) Error(message string, context ...any) {
	r.errorReporter(fmt.Sprintf(message, context...))
}

// Reporting an error with an error value
func (r *TReporter) ReportError(message string, err error) {
	r.Error(message)
	r.Error("=> %s", err)
}

// Reporting an error if the error value is not nil
func (r *TReporter) MaybeReportError(message string, err error) bool {
	if err != nil {
		r.ReportError(message, err)

		return true
	}

	return false
}

func (r *TReporter) MaybeReportEmptyFlagError(flagValue *string, message string) bool {
	// Checking the flag value
	if len(*flagValue) == 0 {
		// Reporting the error if needed
		r.Error(message)

		// Indicating that an error was reported
		return true
	}

	// Indicating that no error was reported
	return false
}

// Panicking with an error message
func (r *TReporter) Panic(message string, context ...any) {
	r.Error(message+" Panicking.", context...)

	panic("")
}

// Panicking with an error message and an error value
func (r *TReporter) PanicError(message string, err error) {
	r.ReportError(message+" Panicking:", err)

	panic("")
}

// Reporting progress
func (r *TReporter) Progress(level int, message string, context ...any) {
	if level <= r.reportingLevel {
		r.progressReporter(fmt.Sprintf(message, context...))
	}
}

// Creating a new reporter
func CreateReporter(level int, errorReporter TErrorReporter, progressReporter TProgressReporter) *TReporter {
	reporter := TReporter{}

	reporter.errorReporter = errorReporter
	reporter.progressReporter = progressReporter
	reporter.reportingLevel = level

	return &reporter
}

/*
 * Default progress and error reporters
 */

func ReportProgress(message string) {
	fmt.Println("PROGRESS:", message)
}

func ReportError(message string) {
	fmt.Println("ERROR:", message)
}
