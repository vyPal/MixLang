package parser

import (
	"regexp"
	"strings"
)

func parseJSVariables(code string) []Variable {
	var variables []Variable

	// Regular expressions to match variable, constant, function, and class declarations
	varRegex := regexp.MustCompile(`\b(var|let|const)\s+(\w+)`)
	funcRegex := regexp.MustCompile(`\bfunction\s+(\w+)`)
	classRegex := regexp.MustCompile(`\bclass\s+(\w+)`)

	// Find all variable declarations
	for _, match := range varRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[2],
			Type:     "variable",
			Language: "js",
		})
	}

	// Find all function declarations
	for _, match := range funcRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[1],
			Type:     "function",
			Language: "js",
		})
	}

	// Find all class declarations
	for _, match := range classRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[1],
			Type:     "class",
			Language: "js",
		})
	}

	return variables
}

func detectJSDependencies(code string, variables []Variable) bool {
	for _, variable := range variables {
		if strings.Contains(code, variable.Name) {
			return true
		}
	}
	return false
}
