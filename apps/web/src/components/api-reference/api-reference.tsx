import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { PageMain, PageRegion, widthClass } from "@/components/page-region";
import { FIELD_CODES } from "@/server/api/field-codes";
import { PROBLEM_STATUS, type ProblemCode } from "@/server/api/http";
import {
	type JsonSchema,
	OPERATION_PROBLEMS,
	type OpenApiDocument,
	referencedName,
	schemaOf,
	tagOf,
} from "@/server/api/openapi";

import { InlineCode } from "./inline-code";
import { constraints, fieldAnchor, problemAnchor, schemaAnchor, SchemaType } from "./schema-type";

type Translate = Awaited<ReturnType<typeof getTranslations<"ApiReference">>>;

type OperationObject = NonNullable<OpenApiDocument["paths"][string]["get"]>;

type Endpoint = { method: string; path: string; operation: OperationObject };

const BASE_PATH = "/api/v1";

function authAnchor(scheme: string): string {
	return `auth-${scheme}`;
}

function endpoints(document: OpenApiDocument): Endpoint[] {
	return Object.entries(document.paths).flatMap(([path, methods]) =>
		Object.entries(methods).map(([method, operation]) => ({ method, path, operation })),
	);
}

const sectionHeading = "text-2xl";
const entryHeading = "text-xl";
const subHeading = "font-sans text-base font-semibold";
const list = "flex flex-col divide-y divide-line";
const link = "text-action underline underline-offset-4";

/** One line of a definition list: a name in code, what it is, and a sentence about it. */
function Entry({
	name,
	id,
	detail,
	children,
}: {
	name: ReactNode;
	id?: string;
	detail?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div id={id} className="flex flex-col gap-1 py-3">
			<dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<code className="font-mono font-semibold break-all">{name}</code>
				{detail !== undefined && (
					<span className="font-mono break-words text-ink-muted">{detail}</span>
				)}
			</dt>
			{children !== undefined && <dd className={widthClass("measure")}>{children}</dd>}
		</div>
	);
}

function Property({
	name,
	schema,
	required,
	t,
}: {
	name: string;
	schema: JsonSchema;
	required: boolean;
	t: Translate;
}) {
	const limits = constraints(schema);

	return (
		<Entry
			name={name}
			detail={
				<>
					<SchemaType schema={schema} />
					{required && `, ${t("page.required")}`}
				</>
			}
		>
			{schema.description !== undefined && <InlineCode text={schema.description} />}
			{limits.length > 0 && (
				<span className="block font-mono text-ink-muted">{limits.join(", ")}</span>
			)}
		</Entry>
	);
}

function Responses({ endpoint, t }: { endpoint: Endpoint; t: Translate }) {
	const problems = OPERATION_PROBLEMS.get(endpoint.operation.operationId) ?? [];
	const byStatus = Map.groupBy(problems, (code: ProblemCode): number => PROBLEM_STATUS[code]);

	return (
		<dl className={list}>
			{Object.entries(endpoint.operation.responses).map(([status, response]) => {
				const codes = byStatus.get(Number(status));
				const body = response.content?.["application/json"]?.schema;
				const headers = Object.keys(response.headers ?? {});

				return (
					<Entry key={status} name={status}>
						{codes === undefined ? (
							<span className="flex flex-col gap-1">
								<InlineCode text={response.description} />
								<span>
									{body === undefined ? (
										t("page.noBody")
									) : (
										<code className="font-mono">
											<SchemaType schema={body} />
										</code>
									)}
									{headers.length > 0 && (
										<>
											{" · "}
											{t("page.headers")}: <code className="font-mono">{headers.join(", ")}</code>
										</>
									)}
								</span>
							</span>
						) : (
							<span className="flex flex-wrap gap-x-4 gap-y-1">
								{codes.map((code) => (
									<a key={code} href={`#${problemAnchor(code)}`} className={`${link} font-mono`}>
										{code}
									</a>
								))}
							</span>
						)}
					</Entry>
				);
			})}
		</dl>
	);
}

function Operation({ endpoint, t }: { endpoint: Endpoint; t: Translate }) {
	const { method, path, operation } = endpoint;
	const secret = Object.keys(operation.security[0] ?? {})[0];
	const body = operation.requestBody?.content["application/json"]?.schema;

	return (
		<section
			id={operation.operationId}
			aria-labelledby={`${operation.operationId}-heading`}
			className="flex flex-col gap-4 border-t border-line pt-6"
		>
			<div className="flex flex-col gap-1">
				<h3 id={`${operation.operationId}-heading`} className={entryHeading}>
					{operation.summary}
				</h3>
				<p className="font-mono font-semibold break-all">
					{method.toUpperCase()} {BASE_PATH}
					{path}
				</p>
			</div>
			<p className={widthClass("measure")}>
				<InlineCode text={operation.description} />
			</p>
			<p className={widthClass("measure")}>
				{secret === undefined ? (
					t("page.noSecret")
				) : (
					<>
						{t("page.secret")}:{" "}
						<a href={`#${authAnchor(secret)}`} className={`${link} font-mono`}>
							{secret}
						</a>
					</>
				)}
			</p>
			{operation.parameters !== undefined && (
				<div className="flex flex-col gap-2">
					<h4 className={subHeading}>{t("page.parameters")}</h4>
					<dl className={list}>
						{operation.parameters.map((parameter) => (
							<Entry
								key={`${parameter.in}-${parameter.name}`}
								name={parameter.name}
								detail={
									<>
										{t(`page.in.${parameter.in}`)}, <SchemaType schema={parameter.schema} />
										{parameter.required && `, ${t("page.required")}`}
									</>
								}
							>
								<InlineCode text={parameter.description} />
							</Entry>
						))}
					</dl>
				</div>
			)}
			{body !== undefined && (
				<div className="flex flex-col gap-2">
					<h4 className={subHeading}>{t("page.requestBody")}</h4>
					<p className="font-mono">
						<SchemaType schema={body} />
					</p>
				</div>
			)}
			<div className="flex flex-col gap-2">
				<h4 className={subHeading}>{t("page.responses")}</h4>
				<Responses endpoint={endpoint} t={t} />
			</div>
		</section>
	);
}

function Schema({ name, schema, t }: { name: string; schema: JsonSchema; t: Translate }) {
	const required = new Set(schema.required ?? []);
	const tag = tagOf(schema);

	const properties = Object.entries(schema.properties ?? {}).flatMap(([property, value]) => {
		const described = schemaOf(value);

		return described === undefined ? [] : [{ property, schema: described }];
	});

	const variants = (schema.oneOf ?? []).flatMap((variant) => {
		const described = schemaOf(variant);
		const variantName = described === undefined ? undefined : referencedName(described);

		return variantName === undefined ? [] : [variantName];
	});

	return (
		<section
			id={schemaAnchor(name)}
			aria-labelledby={`${schemaAnchor(name)}-heading`}
			className="flex flex-col gap-3 border-t border-line pt-6"
		>
			<h3 id={`${schemaAnchor(name)}-heading`} className={`${entryHeading} font-mono`}>
				{name}
			</h3>
			{schema.description !== undefined && (
				<p className={widthClass("measure")}>
					<InlineCode text={schema.description} />
				</p>
			)}
			{variants.length > 0 && (
				<div className="flex flex-col gap-1">
					<p>
						{tag === undefined ? (
							`${t("page.oneOf")}:`
						) : (
							<>
								{t("page.oneOfTagged")} <code className="font-mono">{tag}</code>:
							</>
						)}
					</p>
					<ul className="flex flex-wrap gap-x-4 gap-y-1">
						{variants.map((variant) => (
							<li key={variant}>
								<a href={`#${schemaAnchor(variant)}`} className={`${link} font-mono`}>
									{variant}
								</a>
							</li>
						))}
					</ul>
				</div>
			)}
			{properties.length > 0 && (
				<dl className={list}>
					{properties.map(({ property, schema: value }) => (
						<Property
							key={property}
							name={property}
							schema={value}
							required={required.has(property)}
							t={t}
						/>
					))}
				</dl>
			)}
		</section>
	);
}

/** The reference of the public API, drawn from its OpenAPI document. */
export async function ApiReference({ document }: { document: OpenApiDocument }) {
	const t = await getTranslations("ApiReference");
	const all = endpoints(document);
	const schemes = Object.entries(document.components.securitySchemes);
	const schemas = Object.entries(document.components.schemas);
	const problems = Object.entries(PROBLEM_STATUS);

	const sections = [
		["authentication", t("page.authentication")],
		["endpoints", t("page.endpoints")],
		["schemas", t("page.schemas")],
		["problems", t("page.problems")],
		["field-codes", t("page.fieldCodes")],
	] as const;

	return (
		<PageMain className="gap-12">
			<PageRegion width="measure" className="gap-4">
				<h1 className="text-3xl sm:text-4xl">{document.info.title}</h1>
				<p className="text-lg">
					<InlineCode text={document.info.description} />
				</p>
				<p>
					{t("page.basePath")} <code className="font-mono">{BASE_PATH}</code>
					{" · "}
					<a href={`${BASE_PATH}/openapi.json`} className={link}>
						{t("page.document")}
					</a>
				</p>
			</PageRegion>

			<nav aria-labelledby="contents" className="flex flex-col gap-3">
				<h2 id="contents" className={sectionHeading}>
					{t("page.contents")}
				</h2>
				<ul className="flex flex-col gap-2">
					{sections.map(([id, label]) => (
						<li key={id}>
							<a href={`#${id}`} className={link}>
								{label}
							</a>
							{id === "endpoints" && (
								<ul className="mt-2 flex flex-col gap-2 ps-5">
									{all.map(({ operation }) => (
										<li key={operation.operationId}>
											<a href={`#${operation.operationId}`} className={link}>
												{operation.summary}
											</a>
										</li>
									))}
								</ul>
							)}
						</li>
					))}
				</ul>
			</nav>

			<section aria-labelledby="authentication" className="flex flex-col gap-4">
				<h2 id="authentication" className={sectionHeading}>
					{t("page.authentication")}
				</h2>
				<dl className={list}>
					{schemes.map(([name, scheme]) => (
						<Entry key={name} id={authAnchor(name)} name={name} detail="Authorization: Bearer">
							<InlineCode text={scheme.description} />
						</Entry>
					))}
				</dl>
			</section>

			<section aria-labelledby="endpoints" className="flex flex-col gap-6">
				<h2 id="endpoints" className={sectionHeading}>
					{t("page.endpoints")}
				</h2>
				{all.map((endpoint) => (
					<Operation key={endpoint.operation.operationId} endpoint={endpoint} t={t} />
				))}
			</section>

			<section aria-labelledby="schemas" className="flex flex-col gap-6">
				<h2 id="schemas" className={sectionHeading}>
					{t("page.schemas")}
				</h2>
				{schemas.map(([name, schema]) => (
					<Schema key={name} name={name} schema={schema} t={t} />
				))}
			</section>

			<section aria-labelledby="problems" className="flex flex-col gap-4">
				<h2 id="problems" className={sectionHeading}>
					{t("page.problems")}
				</h2>
				<p className={widthClass("measure")}>
					<InlineCode text={t("page.problemsLead")} />
				</p>
				<dl className={list}>
					{problems.map(([code, status]) => (
						<Entry key={code} id={problemAnchor(code)} name={code} detail={status}>
							{t(`problems.${code}`)}
						</Entry>
					))}
				</dl>
			</section>

			<section aria-labelledby="field-codes" className="flex flex-col gap-4">
				<h2 id="field-codes" className={sectionHeading}>
					{t("page.fieldCodes")}
				</h2>
				<p className={widthClass("measure")}>
					<InlineCode text={t("page.fieldCodesLead")} />
				</p>
				<dl className={list}>
					{FIELD_CODES.map((code) => (
						<Entry key={code} id={fieldAnchor(code)} name={code}>
							{t(`fieldCodes.${code}`)}
						</Entry>
					))}
				</dl>
			</section>
		</PageMain>
	);
}
