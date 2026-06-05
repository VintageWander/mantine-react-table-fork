import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";
import postcss from "rollup-plugin-postcss";
import pkg from "./package.json" with { type: "json" };

// Everything that should be resolved from the consuming app instead of being
// bundled: peer dependencies + runtime deps, including their subpath imports
// (e.g. `react/jsx-runtime`, `@mantine/core/...`).
const externalPackages = [
	"@mantine/core",
	"@mantine/dates",
	"@mantine/hooks",
	"@tabler/icons-react",
	"@tanstack/match-sorter-utils",
	"@tanstack/react-table",
	"@tanstack/react-virtual",
	"clsx",
	"dayjs",
	"react",
	"react-dom",
];

const isExternal = (id) =>
	externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

export default [
	{
		external: isExternal,
		input: "./src/index.ts",
		output: [
			{
				file: `./${pkg.main}`,
				format: "cjs",
				sourcemap: true,
			},
			{
				file: `./${pkg.module}`,
				format: "esm",
				sourcemap: true,
			},
		],
		plugins: [
			typescript({
				rootDir: "./src",
				declarationDir: "./dist/types",
			}),
			postcss({
				extract: true,
				minimize: false,
				modules: true,
			}),
		],
	},
	{
		input: "./dist/types/index.d.ts",
		output: [
			{ file: `./dist/index.d.cts`, format: "cjs" },
			{ file: "./dist/index.esm.d.mts", format: "esm" },
		],
		plugins: [
			copy({
				hook: "buildStart",
				targets: [{ dest: "./", rename: "styles.css", src: "dist/index.css" }],
			}),
			del({
				hook: "buildEnd",
				targets: ["dist/index.css", "dist/index.esm.css", "dist/types"],
			}),
			dts(),
		],
	},
];
