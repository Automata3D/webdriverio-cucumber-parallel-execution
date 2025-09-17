const fs = require('fs');
const Gherkin = require("gherkin");
const glob = require("glob");
const parser = new (require("cucumber-tag-expressions").TagExpressionParser)();
const path = require("path");
const _ = require("lodash");
const chalk = require('chalk');


let featureFileSplitter = function () {

    /**
     * Compile and create splitted files
     * @param {string} options.sourceSpecDirectory - glob expression for sourceSpecDirectory
     * @param {string} options.tmpSpecDirectory - path to temp folder
     * @param {string} [options.tagExpression] - tag expression to parse
     * @param {string} [options.lang] - language of sourceSpecDirectory
     * @param {string} [options.splitScenarioOutLineMultipleExamples] - language of sourceSpecDirectory
     *
     * @return {Promise<void>}
     */
    this.compile = function (options) {
        try {

            if (!options.sourceSpecDirectory) {
                throw new Error("Features paths are not defined");
            }
            if (!options.tmpSpecDirectory) {
                throw new Error("Output dir path is not defined");
            }
            options.tagExpression = options.tagExpression || "";
            options.lang = options.lang || "en";

            let filePaths = [];
            if (options.ff == undefined) {
                filePaths = glob.sync(`${options.sourceSpecDirectory}/*.feature`);
            } else {
                const featureFile = `${options.sourceSpecDirectory}/${options.ff}.feature`;
                filePaths.push(featureFile);
            }

            const featureTexts = this.readFiles(filePaths);
 
            const asts = this.parseGherkinFiles(featureTexts, options.lang);
            var i = 1;
            var fileSequence = 0;
            var scenariosWithTagFound = false;
            asts.forEach(ast => {
                
                if (ast.feature != undefined || ast.feature != null) {
                    const featureTemplate = this.getFeatureTemplate(ast);
                    const features = this.splitFeature(ast.feature.children, featureTemplate, options.splitScenarioOutLineMultipleExamples, options.tagExpression);

                    const filteredFeatures = this.filterFeaturesByTag(features, options.tagExpression);
                    if (filteredFeatures.length > 0) {
                        scenariosWithTagFound = true;
                    }
                    filteredFeatures.forEach(splitFeature => {
                        const splitFilePath = (filePaths[fileSequence]).split("/");
                        let parentFileName = splitFilePath[splitFilePath.length - 1];
                        parentFileName = parentFileName.replace(".feature", "_");
                        const fileName = parentFileName + i + '.feature';
                        i++;
                        fs.writeFileSync(path.resolve(`${options.tmpSpecDirectory}/${fileName}`), this.writeFeature(splitFeature.feature), "utf8");
                    });
                    fileSequence++;
                }
            });

            if (scenariosWithTagFound == false) {
                console.log(chalk.bold.hex('#7D18FF')(`No Feature File found for the Tag Expression: ${options.tagExpression}`));
            }
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Read file content by provided paths
     * @private
     * @param filePaths
     * @return {Array}
     */
    this.readFiles = function (filePaths) {
        try {
            return filePaths.map(filePath => fs.readFileSync(filePath, "utf8"))
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Parse gherkin files to ASTs
     * @private
     * @param features - features to parse
     * @param lang - language to parse
     * @return {Array}
     */
    this.parseGherkinFiles = function (features, lang) {
        try {
            const parser = new Gherkin.Parser();
            const matcher = new Gherkin.TokenMatcher(lang);

            return features.map(feature => {
                const scanner = new Gherkin.TokenScanner(feature);
                return parser.parse(scanner, matcher)
            });
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Get feature template for splitting
     * @private
     * @param feature
     * @return {*}
     */
    this.getFeatureTemplate = function (feature) {
        try {
            const featureTemplate = _.cloneDeep(feature);
            featureTemplate.feature.children = featureTemplate.feature.children.filter(scenario => scenario.type === "Background");
            return featureTemplate
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Split feature
     * @param {Array} scenarios - list of scenarios
     * @param {Object} featureTemplate - template of feature
     * @param {boolean} splitScenarioOutLineMultipleExamples - whether to split examples
     * @return {Array} - list of features
     * @private
     */
    this.splitFeature = function (scenarios, featureTemplate, splitScenarioOutLineMultipleExamples, tagExpression) {
        try {
            // console.log('=== splitFeature input scenarios ===');
            // scenarios.forEach((s, idx) => {
            //     console.log(
            //         idx,
            //         s.type,
            //         s.name,
            //         'tags:', s.tags?.map(t => t.name),
            //         'examples:', s.examples?.length
            //     );
            //     if (s.examples) {
            //         s.examples.forEach((ex, exIdx) => {
            //             console.log('  Example', exIdx,
            //                 'tags:', ex.tags?.map(t => t.name),
            //                 'rows:', ex.tableBody.map(r => r.cells.map(c => c.value))
            //             );
            //         });
            //     }
            // });

            const features = [];

            scenarios
                .filter(scenario => scenario.type !== "Background")
                .forEach(scenario => {
                    if (scenario.type === "ScenarioOutline") {
                        const scenarioTemplate = _.cloneDeep(scenario);

                        if (!scenario.examples || scenario.examples.length === 0) {
                            console.warn("Missing examples for Scenario Outline:", scenario.name);
                            return;
                        }
                        if ( splitScenarioOutLineMultipleExamples ) {
                            // CASE 1: Tagged Examples → split and merge tags
                            const hasTaggedExamples = scenario.examples.some(ex => ex.tags && ex.tags.length > 0);
                            if (hasTaggedExamples) {
                                scenario.examples.forEach(example => {
                                    example.tableBody.forEach(row => {
                                        const feature = _.cloneDeep(featureTemplate);
                                        const updatedScenario = _.cloneDeep(scenarioTemplate);

                                        updatedScenario.examples = [_.cloneDeep(example)];
                                        updatedScenario.examples[0].tableBody = [row];

                                        updatedScenario.tags = [
                                            ...(scenario.tags || []),
                                            ...featureTemplate.feature.tags,
                                            ...(example.tags || [])
                                        ];

                                        feature.feature.children.push(updatedScenario);
                                        features.push(feature);
                                    });
                                });
                            }
                            // CASE 2: Untagged Examples → split rows once
                            else {
                                const allRows = scenario.examples.flatMap(example => example.tableBody);

                                allRows.forEach(row => {
                                    const feature = _.cloneDeep(featureTemplate);
                                    const updatedScenario = _.cloneDeep(scenarioTemplate);

                                    // Keep only this row in examples
                                    updatedScenario.examples = [_.cloneDeep(scenario.examples[0])];
                                    updatedScenario.examples[0].tableBody = [row];

                                    // Merge scenario + feature tags (no example tags)
                                    updatedScenario.tags = [
                                        ...(scenario.tags || []),
                                        ...featureTemplate.feature.tags
                                    ];

                                    feature.feature.children.push(updatedScenario);
                                    features.push(feature);
                                });
                            }

                        } else {
                            // CASE 3: Keep ScenarioOutline intact
                            const feature = _.cloneDeep(featureTemplate);
                            const updatedScenario = _.cloneDeep(scenarioTemplate);

                            // Merge tags: scenario tags + feature tags
                            updatedScenario.tags = [
                                ...(scenario.tags || []),
                                ...featureTemplate.feature.tags
                            ];

                            // Only merge example tags if the combined scenario+example tags satisfy the tagExpression
                            scenario.examples.forEach(example => {
                                const combinedTags = [
                                    ...(scenario.tags || []).map(t => t.name),
                                    ...(example.tags || []).map(t => t.name)
                                ];
                                const requiredTags = tagExpression.split(/\s+and\s+/).map(t => t.trim());

                                const matches = requiredTags.every(tag => combinedTags.includes(tag));

                                if (matches) {
                                    updatedScenario.tags = updatedScenario.tags.concat(example.tags || []);
                                }
                            });

                            feature.feature.children.push(updatedScenario);
                            features.push(feature);
                        }
                    } else {
                        // Regular Scenario (not outline)
                        const feature = _.cloneDeep(featureTemplate);
                        const updatedScenario = _.cloneDeep(scenario);
                        updatedScenario.tags = [...(scenario.tags || []), ...featureTemplate.feature.tags];
                        feature.feature.children.push(updatedScenario);
                        features.push(feature);
                    }
                });

            return features;
        } catch (e) {
            console.log('Error in splitFeature:', e);
        }
    };

    /**
     * Write features to files
     * @param feature
     * @return {string}
     * @private
     */
    this.writeFeature = function (feature) {
        try {
            const LINE_DELIMITER = "\n";

            let featureString = "";

            if (feature.tags) {
                feature.tags.forEach(tag => {
                    featureString += `${tag.name}${LINE_DELIMITER}`
                });
            }
            featureString += `${feature.type}: ${feature.name}${LINE_DELIMITER}`;

            feature.children.forEach(scenario => {
                if (scenario.tags) {
                    scenario.tags.forEach(tag => {
                        featureString += `${tag.name}${LINE_DELIMITER}`
                    });
                }
                featureString += `${scenario.keyword}: ${scenario.name}${LINE_DELIMITER}`;
                scenario.steps.forEach(step => {
                    if (step.argument != undefined) {
                        featureString += `${step.keyword}${step.text}${LINE_DELIMITER}`;
                        if (step.argument.type === 'DataTable') {
                            step.argument.rows.forEach(row => {
                                var cellData = '|';
                                row.cells.forEach(cell => {
                                    cellData += cell.value + '|'
                                });
                                featureString += `${cellData}${LINE_DELIMITER}`;
                            })
                        }
                        if (step.argument.type === 'DocString') {
                            featureString += "\"\"\"" + `${LINE_DELIMITER}` + step.argument.content + `${LINE_DELIMITER}` + "\"\"\"" + `${LINE_DELIMITER}`;

                        }
                    } else {
                        featureString += `${step.keyword}${step.text}${LINE_DELIMITER}`;
                    }
                });

                if (scenario.examples) {
                    const example = scenario.examples[0];
                    featureString += `Examples:${LINE_DELIMITER}`;
                    featureString += `|${example.tableHeader.cells.map(cell => `${cell.value}|`).join("")}${LINE_DELIMITER}`;
                    example.tableBody.forEach(tableRow => {
                        featureString += `|${tableRow.cells.map(cell => `${cell.value}|`).join("")}${LINE_DELIMITER}`;
                    })
                }
            });

            return featureString;
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Filter features by tag expression
     * @param features
     * @param tagExpression
     * @return {Array}
     * @private
     */
    this.filterFeaturesByTag = function (features, tagExpression) {
        try {
            const expressionNode = parser.parse(tagExpression);
            return features.filter(feature => {
                return feature.feature.children.some(scenario => {
                    if (scenario.tags) {
                        return expressionNode.evaluate(scenario.tags.map(tag => tag.name))
                    }
                })
            });
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    /**
     * Checks if an example matches the tag expression
     * @param {Object} example - Gherkin example object (with .tags)
     * @param {string} tagExpression - tag expression string, e.g., "@A and @B and @C"
     * @returns {boolean} - true if example matches the tag expression
     */
    this.exampleMatchesFilter = function (example, scenarioTags, tagExpression) {
        if (!tagExpression) return false;

        // Combine scenario + example tags
        const combinedTags = new Set([
            ...(scenarioTags || []).map(t => t.name),
            ...(example.tags || []).map(t => t.name)
        ]);

        // Split the tag expression by 'and'
        const requiredTags = tagExpression.split(/\s+and\s+/).map(t => t.trim());

        // Check if all required tags exist in combined tags
        return requiredTags.every(tag => combinedTags.has(tag));
    };

}

module.exports = featureFileSplitter;
