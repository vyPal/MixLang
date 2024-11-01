package parser

import (
	"regexp"
	"strings"
)

func parsePyVariables(code string) []Variable {
	var variables []Variable

	// Regular expressions to match variable, constant, function, and class declarations
	varRegex := regexp.MustCompile(`\b(\w+)\s*=\s*`)
	funcRegex := regexp.MustCompile(`\bdef\s+(\w+)`)
	classRegex := regexp.MustCompile(`\bclass\s+(\w+)`)

	// Find all variable declarations
	for _, match := range varRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[1],
			Type:     "variable",
			Language: "py",
		})
	}

	// Find all function declarations
	for _, match := range funcRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[1],
			Type:     "function",
			Language: "py",
		})
	}

	// Find all class declarations
	for _, match := range classRegex.FindAllStringSubmatch(code, -1) {
		variables = append(variables, Variable{
			Name:     match[1],
			Type:     "class",
			Language: "py",
		})
	}

	return variables
}

func detectPyDependencies(code string, variables []Variable) bool {
	for _, variable := range variables {
		if strings.Contains(code, variable.Name) {
			return true
		}
	}
	return false
}
