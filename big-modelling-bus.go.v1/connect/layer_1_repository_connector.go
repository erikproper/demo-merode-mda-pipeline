/*
 *
 * Module:    BIG Modelling Bus, Version 1
 * Package:   Connect
 * Component: Layer 1 - Repository Connector
 *
 * This component provides the connectivity to the FTP-based repository.
 *
 * Creator: Henderik A. Proper (e.proper@acm.org), TU Wien, Austria
 *
 * Version of: 29.11.2025
 *
 */

package connect

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/erikproper/big-modelling-bus.go.v1/generics"
	"github.com/secsy/goftp"
)

/*
 * Defining the repository connector
 */

type (
	tModellingBusRepositoryConnector struct {
		port               string // FTP port
		user               string // FTP user
		server             string // FTP server
		prefix             string // FTP topic prefix
		agentID            string // Agent ID to be used in postings on the FTP repository
		password           string // FTP password
		environmentID      string // Modelling environment ID
		localWorkDirectory string // Local work directory

		activeTransfers  bool // Whether to use active transfers for FTP
		singleServerMode bool // Whether to use a single FTP server for all agents and environments

		createdPaths map[string]bool // Paths already created on the FTP server

		reporter *generics.TReporter // The Reporter to be used to report progress, error, and panics
	}
)

/*
 * Defining repository events
 */

type tRepositoryEvent struct {
	Server    string `json:"server,omitempty"`    // FTP server for the file
	Port      string `json:"port,omitempty"`      // FTP port on the FTP server
	FilePath  string `json:"file path,omitempty"` // Path to the file on the FTP server
	Timestamp string `json:"timestamp"`           // Timestamp of the event
}

/*
 * Defining topic paths and file paths
 */

// Get the local file path for a given file name
func (r *tModellingBusRepositoryConnector) localFilePathFor(fileName string) string {
	return filepath.FromSlash(r.localWorkDirectory + "/" + fileName)
}

// Get the topic root for the given modelling environment
func (r *tModellingBusRepositoryConnector) ftpEnvironmentTopicRootFor(environmentID string) string {
	return r.prefix + "/" + generics.ModellingBusVersion + "/" + environmentID
}

// Get the topic path for the given agent and topic path
func (r *tModellingBusRepositoryConnector) ftpTopicPath(topicPath string) string {
	return r.prefix + "/" + generics.ModellingBusVersion + "/" + r.environmentID + "/" + r.agentID + "/" + topicPath
}

/*
 * FTP connection and operations
 */

// Connecting to the FTP server
func (r *tModellingBusRepositoryConnector) ftpConnect() (*goftp.Client, bool) {
	// Define the FTP connection configuration
	config := goftp.Config{}
	config.User = r.user
	config.Password = r.password
	config.ActiveTransfers = r.activeTransfers
	serverDefinition := r.server + ":" + r.port

	// Finally, connect to the FTP server
	client, err := goftp.DialConfig(config, serverDefinition)
	if err != nil {
		r.reporter.ReportError("Error connecting to the FTP server:", err)
		return client, false
	}

	// Return the connected client
	return client, true
}

// Make sure the given repository file path exists on the FTP server
func (r *tModellingBusRepositoryConnector) mkRepositoryFilePath(remoteFilePath string) {
	// Create the path on the FTP server, if not already done
	if !r.createdPaths[remoteFilePath] {
		// Connect to the FTP server
		if client, ok := r.ftpConnect(); ok {
			pathCovered := ""
			// Create all directories in the path, if not already existing
			for _, Directory := range strings.Split(remoteFilePath, "/") {
				pathCovered = pathCovered + Directory + "/"
				client.Mkdir(pathCovered)
			}

			// Close the FTP connection
			client.Close()

			// Mark the path as created
			r.createdPaths[remoteFilePath] = true
		}
	}
}

// Add a file to the repository
func (r *tModellingBusRepositoryConnector) addFile(topicPath, localFilePath, timestamp string) tRepositoryEvent {
	// Define the remote file path
	remoteFilePath := r.ftpTopicPath(topicPath)
	remotePayloadFileNamePath := remoteFilePath + "/" + generics.PayloadFileName

	// Make sure the path exists on the FTP server
	r.mkRepositoryFilePath(remoteFilePath)

	// Upload the file to the FTP server
	repositoryEvent := tRepositoryEvent{}
	repositoryEvent.Timestamp = timestamp

	// Open the local file for reading
	file, err := os.Open(filepath.FromSlash(localFilePath))

	// Handle potential errors
	if err != nil {
		r.reporter.ReportError("Error opening File for reading:", err)
		return repositoryEvent
	}

	// Connect to the FTP server
	client, ok := r.ftpConnect()
	if !ok {
		return repositoryEvent
	}

	// Store the file on the FTP server
	err = client.Store(remotePayloadFileNamePath, file)

	// Handle potential errors when opening the file
	if err != nil {
		r.reporter.ReportError("Error uploading file to ftp server:", err)
		r.reporter.Error("For remote file path: %s", remotePayloadFileNamePath)
		return repositoryEvent
	}

	// Close the local file
	client.Close()

	// Define the repository event
	if !r.singleServerMode {
		repositoryEvent.Server = r.server
		repositoryEvent.Port = r.port
	}
	repositoryEvent.FilePath = remotePayloadFileNamePath

	// Return the repository event
	return repositoryEvent
}

// Delete a path from the repository
func deleteRepositoryPath(client *goftp.Client, deletePath string) {
	// We're not certain if deletePath refers to a file or a directory.

	// So first, we try to read it as a directory.
	fileInfos, _ := client.ReadDir(deletePath)
	if len(fileInfos) > 0 {
		// If it works, we delete all contents recursively, then remove the directory itself.
		for _, fileInfo := range fileInfos {
			deleteRepositoryPath(client, deletePath+"/"+fileInfo.Name())
		}
		client.Rmdir(deletePath)
	} else {
		// If it fails, we assume it's a file and delete it directly.
		client.Delete(deletePath)
	}
}

// Delete a given path from the repository
func (r *tModellingBusRepositoryConnector) deletePath(deletePath string) {
	// Connect to the FTP server
	if client, ok := r.ftpConnect(); ok {
		// Then, delete the given path from the FTP server
		deleteRepositoryPath(client, deletePath)
	}
}

// Delete the posting path for the given topic path
func (r *tModellingBusRepositoryConnector) deletePostingPath(topicPath string) {
	// Delete the path from the FTP server for the given topic path
	r.deletePath(r.ftpTopicPath(topicPath))
}

// Delete an entire environment from the repository
func (r *tModellingBusRepositoryConnector) deleteEnvironment(environment string) {
	// Delete the entere file tree from the FTP server for the given environment
	r.deletePath(r.ftpEnvironmentTopicRootFor(environment))
}

// Add JSON content as a file to the repository
func (r *tModellingBusRepositoryConnector) addJSONAsFile(topicPath string, json []byte, timestamp string) tRepositoryEvent {
	// Define the temporary local file path
	localFilePath := r.localFilePathFor(generics.JSONFileName)

	// Validate that the content is a valid JSON
	if !generics.IsJSON(json) {
		r.reporter.Error("Provided content is not a valid JSON.")
		return tRepositoryEvent{}
	}

	// Create a temporary local file with the JSON record
	if err := os.WriteFile(localFilePath, json, 0644); err != nil {
		r.reporter.ReportError("Error writing to temporary file:", err)
		return tRepositoryEvent{}
	}

	// Cleanup the temporary file afterwards
	defer os.Remove(localFilePath)

	// Add the file to the repository
	return r.addFile(topicPath, localFilePath, timestamp)
}

// Get a file from the repository
func (r *tModellingBusRepositoryConnector) getFile(repositoryEvent tRepositoryEvent, fileName string) string {
	// Configure FTP connection
	config := goftp.Config{}
	config.ActiveTransfers = r.activeTransfers
	serverConnection := ""

	// Determine server connection details
	if r.singleServerMode {
		serverConnection = r.server + ":" + r.port

		config.User = r.user
		config.Password = r.password
	} else {
		serverConnection = repositoryEvent.Server + ":" + repositoryEvent.Port
	}

	// Connect to the FTP server
	client, err := goftp.DialConfig(config, serverConnection)
	if err != nil {
		r.reporter.ReportError("Something went wrong connecting to the FTP server:", err)
		return ""
	}

	// Set local file path
	localFileName := r.localFilePathFor(fileName)

	// Download file to local storage
	File, err := os.Create(localFileName)
	if err != nil {
		r.reporter.ReportError("Something went wrong creating local file:", err)
		return ""
	}

	// Ensure the file is closed after operation
	defer File.Close()

	// Retrieve the file from the FTP server
	if err = client.Retrieve(repositoryEvent.FilePath, File); err != nil {
		r.reporter.ReportError("Something went wrong retrieving file:", err)
		r.reporter.Error("Was trying to retrieve: %s", repositoryEvent.FilePath)
		return ""
	}

	// Return the local file name
	return localFileName
}

// Create the modelling bus repository connector
func createModellingBusRepositoryConnector(environmentID, agentID string, configData *generics.TConfigData, reporter *generics.TReporter) *tModellingBusRepositoryConnector {
	// Create the repository connector
	r := tModellingBusRepositoryConnector{}

	// Get data from the config file
	r.localWorkDirectory = configData.GetValue("", "work_folder").String()
	r.port = configData.GetValue("ftp", "port").String()
	r.user = configData.GetValue("ftp", "user").String()
	r.server = configData.GetValue("ftp", "server").String()
	r.password = configData.GetValue("ftp", "password").String()
	r.singleServerMode = configData.GetValue("ftp", "single_server_mode").BoolWithDefault(false)
	r.activeTransfers = configData.GetValue("ftp", "active_transfers").BoolWithDefault(false)
	r.prefix = configData.GetValue("ftp", "prefix").String()

	// Initialising other data
	r.reporter = reporter
	r.agentID = agentID
	r.environmentID = environmentID
	r.reporter = reporter
	r.createdPaths = map[string]bool{}

	// Reporting on the configuration
	if r.singleServerMode {
		r.reporter.Progress(generics.ProgressLevelDetailed, "Running the FTP connection in single server mode.")
	} else {
		r.reporter.Progress(generics.ProgressLevelDetailed, "Running the FTP connection in multi server mode.")
	}

	// Reporting on the transfer mode
	if r.activeTransfers {
		r.reporter.Progress(generics.ProgressLevelDetailed, "Running the FTP connection in active transfer mode.")
	} else {
		r.reporter.Progress(generics.ProgressLevelDetailed, "Running the FTP connection in passive transfer mode.")
	}

	// Return the created repository connector
	return &r
}
