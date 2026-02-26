/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Generic
 * Component: Config Reader
 *
 * This component reads ini files.
 * It gladly uses the functionality provided by "gopkg.in/ini.v1".
 * Nevertheless, having our own configuration loader makes the rest of the code less dependent on potential changes to
 * the latter package.
 * Furthermore, it also allows us to:
 * - introduce the option of default values (see StringWithDefault, etc) of default values, when no value is
 *   provided in the ini file.
 * - use the reporting functionality from the generic_reporting module for progress/error reporting.
 *
 * Author: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 27.11.2025
 *
 */

package generics

import (
	"gopkg.in/ini.v1"
)

/*
 * Defining config data and config value types
 */

type (
	// Since we want to define some extra functions for config data, we need to "wrap" the two existing types as
	// defined by the "gopkg.in/ini.v1" package.

	TConfigData struct {
		configFile *ini.File // The ini file as read by the ini package
	}

	TConfigValue struct {
		configKey *ini.Key // The ini key as read by the ini package
	}
)

/*
 * Loading configguration files
 */

// Load the configuration file.
func LoadConfig(filePath string, reporter *TReporter) *TConfigData {
	var (
		err        error       //	Error return value
		configData TConfigData // The read config data
	)

	reporter.Progress(1, "Reading config file: %s", filePath)
	configData.configFile, err = ini.Load(filePath)

	if err != nil {
		reporter.Panic("Failed to read config file. %s", err)
	}

	return &configData
}

/*
 * Retrieving config values
 */

// Get the value from a given section and key from the read config data
func (c *TConfigData) GetValue(section, key string) *TConfigValue {
	var configValue TConfigValue

	configValue.configKey = c.configFile.Section(section).Key(key)

	return &configValue
}

// Map the config value to a string, using the given default when the config value is empty
func (v *TConfigValue) StringWithDefault(defaultString string) string {
	s := v.configKey.String()
	if s == "" {
		return defaultString
	} else {
		return s
	}
}

// Map the config value to a string, using the empty string as default value
func (v *TConfigValue) String() string {
	return v.StringWithDefault("")
}

// Map the config value to a bool, using the given default when the config value is not provided
func (v *TConfigValue) BoolWithDefault(defaultBool bool) bool {
	keyBool, err := v.configKey.Bool()
	if err == nil {
		return keyBool
	} else {
		return defaultBool
	}
}

// Map the config value to a string, using false as default value
func (v *TConfigValue) Bool() bool {
	return v.BoolWithDefault(false)
}

// Map the config value to an int, using the given default when the config value is not provided
func (v *TConfigValue) IntWithDefault(defaultInt int) int {
	keyInt, err := v.configKey.Int()
	if err == nil {
		return keyInt
	} else {
		return defaultInt
	}
}

// Map the config value to an int, using 0 as default value
func (v *TConfigValue) Int() int {
	return v.IntWithDefault(0)
}
