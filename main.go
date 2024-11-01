package main

import (
	"fmt"
	"os"

	"github.com/urfave/cli/v2"
	"vypal.me/MixLang/parser"
)

func parseFile(filePath string) ([]parser.Section, error) {
	return parser.ParseFile(filePath)
}

func main() {
	app := &cli.App{
		Action: func(c *cli.Context) error {
			if c.NArg() > 0 {
				filePath := c.Args().Get(0)
				sections, err := parseFile(filePath)
				if err != nil {
					return err
				}
				for _, section := range sections {
					fmt.Printf("Language: %s\nCode:\n%s\n", section.Language, section.Code)
				}
			} else {
				fmt.Println("Please provide a file path.")
			}
			return nil
		},
	}

	err := app.Run(os.Args)
	if err != nil {
		fmt.Println(err)
	}
}
