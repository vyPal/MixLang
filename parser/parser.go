package parser

import (
	"bufio"
	"os"
	"strings"
)

type Section struct {
	Language string
	Code     string
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

	return sections, nil
}
