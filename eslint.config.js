import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Local rules encoding the react-state-architecture conventions
 * (see openspec/specs/react-state-architecture):
 * - max-use-state: the component state budget — more than two useState
 *   values must become a single typed reducer.
 * - no-mirroring-effects: effects that mirror React state (deriving state
 *   in effects) instead of deriving at render time or consuming external
 *   stores through the subscription hooks.
 */

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function isUseStateName(name) {
  return name === "useState";
}

function isUseStateCallee(callee) {
  return (
    (callee.type === "Identifier" && callee.name === "useState") ||
    (callee.type === "MemberExpression" &&
      callee.property.type === "Identifier" &&
      callee.property.name === "useState")
  );
}

function isUseEffectCall(node) {
  return (
    node.type === "CallExpression" &&
    ((node.callee.type === "Identifier" && node.callee.name === "useEffect") ||
      (node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "useEffect"))
  );
}

const stateRules = {
  rules: {
    "max-use-state": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Enforce the component state budget: at most two useState per function",
        },
        schema: [{ type: "integer", minimum: 1 }],
        messages: {
          overBudget:
            "Component declares {{count}} useState calls (max {{max}}); consolidate into a single typed reducer.",
        },
      },
      create(context) {
        const max = context.options[0] ?? 2;
        const counts = new Map();
        const functionStack = [];
        return {
          ":function"(node) {
            functionStack.push(node);
          },
          ":function:exit"() {
            functionStack.pop();
          },
          CallExpression(node) {
            if (!isUseStateCallee(node.callee)) {
              return;
            }
            const owner = functionStack[functionStack.length - 1];
            if (owner !== undefined) {
              counts.set(owner, (counts.get(owner) ?? 0) + 1);
            }
          },
          "Program:exit"() {
            for (const [fn, count] of counts) {
              if (count > max) {
                context.report({
                  node: fn,
                  messageId: "overBudget",
                  data: { count, max },
                });
              }
            }
          },
        };
      },
    },
    "no-mirroring-effects": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "Flag useState setters called (or passed) directly inside a useEffect callback — state mirroring. State updates from nested listener callbacks are legitimate.",
        },
        schema: [],
        messages: {
          mirroring:
            "Effect mirrors React state; derive the value during render or consume the external store via useStoreValue instead.",
        },
      },
      create(context) {
        const setterNames = new Map();
        const functionStack = [];
        // Effects currently being visited: their callback is arguments[0].
        const effectCallbacks = [];
        return {
          ":function"(node) {
            functionStack.push(node);
          },
          ":function:exit"() {
            functionStack.pop();
          },
          VariableDeclarator(node) {
            if (node.id.type !== "ArrayPattern" || node.init === null) {
              return;
            }
            const init = node.init;
            const isUseState =
              (init.type === "Identifier" && init.name === "useState") ||
              (init.type === "CallExpression" && isUseStateCallee(init.callee));
            if (!isUseState) {
              return;
            }
            const setter = node.id.elements[1];
            if (setter !== null && setter.type === "Identifier") {
              setterNames.set(setter.name, setter);
            }
          },
          "CallExpression"(node) {
            if (isUseEffectCall(node)) {
              effectCallbacks.push(node);
            }
          },
          "CallExpression:exit"(node) {
            if (isUseEffectCall(node)) {
              effectCallbacks.pop();
            }
          },
          Identifier(node) {
            if (!setterNames.has(node.name) || effectCallbacks.length === 0) {
              return;
            }
            const effectCallback = effectCallbacks[effectCallbacks.length - 1].arguments[0];
            const innermostFunction = functionStack[functionStack.length - 1];
            if (
              effectCallback === undefined ||
              !FUNCTION_TYPES.has(effectCallback.type) ||
              innermostFunction !== effectCallback
            ) {
              return;
            }
            context.report({ node, messageId: "mirroring" });
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ["src-tauri", "dist", "node_modules"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks, "mdr-state": stateRules },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "mdr-state/max-use-state": ["error", 2],
      "mdr-state/no-mirroring-effects": "warn",
    },
  },
);
