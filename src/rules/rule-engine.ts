import { IRuleEngine } from "../core/interfaces";
import { Rule } from "../core/models";

export class RegexRuleEngine implements IRuleEngine {
  findMatchingRule(url: string, rules: Rule[]): Rule | null {
    return rules.find(rule => {
      const regex = new RegExp(`^${rule.path}.*$`);
      return regex.test(url);
    }) || null;
  }
}
