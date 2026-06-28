import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ─────────────────────────────────────────────────────────────────────────────
// Money-safety rule (NN-1, §3 money-safety, SEC-M1).
//
// JS `number` is an IEEE-754 float, so it must never carry money. All monetary
// values are integer ngwee and MUST be typed `bigint`. This rule fails the build
// when a money-named binding is typed `number`, or when a float literal is
// assigned to a money-named target. Float math is then structurally impossible:
// `bigint` cannot mix with `number` and `bigint /` is integer division.
//
// Names are matched by convention; extend MONEY_RE as new money fields appear.
// ─────────────────────────────────────────────────────────────────────────────
const MONEY_RE =
  /(amount|charge|fee|balance|float|ngwee|debit|credit|net_amount|netamount|fixed_value|fixedvalue|settle|minor_units|minorunits|price|payout)/i;

function nameOf(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.key?.type === 'Identifier') return node.key.name;
  if (node.id?.type === 'Identifier') return node.id.name;
  return undefined;
}

const noFloatMoney = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        'Money is integer ngwee and must be typed bigint, never number/float (NN-1, SEC-M1).',
    },
    schema: [],
    messages: {
      numberType:
        "Money field '{{name}}' must be typed `bigint` (integer ngwee), not `number` (NN-1/SEC-M1).",
      floatLiteral:
        "Float literal assigned to money field '{{name}}'. Money is integer ngwee — use bigint (NN-1/SEC-M1).",
    },
  },
  create(context: any) {
    return {
      // money-named binding annotated as `number`
      TSNumberKeyword(node: any) {
        const annotation = node.parent;
        if (annotation?.type !== 'TSTypeAnnotation') return;
        const named = annotation.parent;
        const name = nameOf(named);
        if (name && MONEY_RE.test(name)) {
          context.report({ node: named, messageId: 'numberType', data: { name } });
        }
      },
      // float literal assigned to a money-named target
      'VariableDeclarator, PropertyDefinition, AssignmentExpression'(node: any) {
        let targetName: string | undefined;
        let value: any;
        if (node.type === 'VariableDeclarator') {
          targetName = nameOf(node.id);
          value = node.init;
        } else if (node.type === 'PropertyDefinition') {
          targetName = nameOf(node);
          value = node.value;
        } else {
          targetName = nameOf(node.left);
          value = node.right;
        }
        if (!targetName || !MONEY_RE.test(targetName) || !value) return;
        if (
          value.type === 'Literal' &&
          typeof value.value === 'number' &&
          /\./.test(String(value.raw))
        ) {
          context.report({ node: value, messageId: 'floatLiteral', data: { name: targetName } });
        }
      },
    };
  },
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'eslint.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { money: { rules: { 'no-float-money': noFloatMoney } } },
    rules: {
      'money/no-float-money': 'error',
    },
  },
);
