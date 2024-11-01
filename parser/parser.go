package parser

import (
	"bufio"
	"os"
	"strings"
)

type Variable struct {
	Name     string
	Type     string
	Language string
}

type Section struct {
	Language  string
	Code      string
	Variables []Variable
}

func ParseFile(filePath string) ([]Section, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var sections []Section
	var currentSection *Section

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			if currentSection != nil {
				sections = append(sections, *currentSection)
			}
			currentSection = &Section{
				Language: strings.Trim(line, "[]"),
				Code:     "",
			}
		} else if currentSection != nil {
			currentSection.Code += line + "\n"
		}
	}

	if currentSection != nil {
		sections = append(sections, *currentSection)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	for i, section := range sections {
		sections[i].Variables = parseVariables(section.Language, section.Code)
	}

	return sections, nil
}

func parseVariables(language, code string) []Variable {
	switch language {
	case "js":
		return parseJSVariables(code)
	case "py":
		return parsePyVariables(code)
	default:
		return nil
	}
}

func detectDependencies(code string, variables []Variable) bool {
	for _, variable := range variables {
		if strings.Contains(code, variable.Name) {
			return true
		}
	}
	return false
}
