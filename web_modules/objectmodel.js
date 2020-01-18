const
	bettertypeof = x => Object.prototype.toString.call(x).match(/\s([a-zA-Z]+)/)[1],
	getProto = Object.getPrototypeOf,
	setProto = Object.setPrototypeOf,

	has = (o, prop) => Object.prototype.hasOwnProperty.call(o, prop),
	is = (Constructor, obj) => obj instanceof Constructor,
	isFunction = f => typeof f === "function",
	isObject = o => o && typeof o === "object",
	isPlainObject = o => isObject(o) && getProto(o) === Object.prototype,
	isIterable = x => x && isFunction(x[Symbol.iterator]),

	proxify = (val, traps) => new Proxy(val, traps),

	merge = (target, src = {}) => {
		for (let key in src) {
			if (isPlainObject(src[key])) {
				let o = {};
				merge(o, target[key]);
				merge(o, src[key]);
				target[key] = o;
			} else {
				target[key] = src[key];
			}
		}
		return target
	},

	define = (obj, key, value, enumerable = false) => {
		Object.defineProperty(obj, key, { value, enumerable, writable: true, configurable: true });
	},

	extend = (child, parent, props) => {
		child.prototype = Object.assign(Object.create(parent.prototype, {
			constructor: {
				value: child,
				writable: true,
				configurable: true
			}
		}), props);
		setProto(child, parent);
	};

const
	_check = Symbol(),
	_checked = Symbol(), // used to skip validation at instanciation for perf
	_original = Symbol(), // used to bypass proxy

	initModel = (def, constructor, parent, init, getTraps, useNew) => {
		let model = function (val = model.default, mode) {
			if (useNew && !is(model, this)) return new model(val)
			if (init) val = init(val, model, this);

			if (mode === _checked || check(model, val))
				return getTraps ? proxify(val, getTraps(model)) : val
		};

		if (parent) extend(model, parent);
		setProto(model, constructor.prototype);
		model.constructor = constructor;
		model.definition = def;
		model.assertions = [...model.assertions];
		define(model, "errors", []);
		delete model.name;
		return model
	},

	initObjectModel = (obj, model, _this) => {
		if (is(model, obj)) return obj

		if (!isObject(obj) && !isFunction(obj) && obj !== undefined) {
			stackError(model.errors, Object, obj);
		}

		merge(_this, model.default);
		if (model.parentClass) merge(obj, new model.parentClass(obj));
		merge(_this, obj);
		return _this
	},

	extendModel = (child, parent, newProps) => {
		extend(child, parent, newProps);
		child.assertions.push(...parent.assertions);
		return child
	},

	stackError = (errors, expected, received, path, message) => {
		errors.push({ expected, received, path, message });
	},

	unstackErrors = (model, collector = model.errorCollector) => {
		let nbErrors = model.errors.length;
		if (nbErrors > 0) {
			let errors = model.errors.map(err => {
				if (!err.message) {
					err.message = "expecting " + (err.path ? err.path + " to be " : "") + formatDefinition(err.expected)
						+ ", got " + (err.received != null ? bettertypeof(err.received) + " " : "") + format(err.received);
				}
				return err
			});

			model.errors.length = 0;
			collector.call(model, errors); // throw all errors collected
		}
		return nbErrors
	},

	isModelInstance = i => i && getProto(i) && is(Model, getProto(i).constructor),

	parseDefinition = (def) => {
		if (isPlainObject(def)) {
			Object.keys(def).map(key => { def[key] = parseDefinition(def[key]); });
		}
		else if (!Array.isArray(def)) return [def]
		else if (def.length === 1) return [def[0], undefined, null]

		return def
	},

	formatDefinition = (def, stack) => {
		let parts = parseDefinition(def).map(d => format(d, stack));
		return parts.length > 1 ? parts.join(" or ") : parts[0]
	},

	formatAssertions = fns => fns.length ? `(${fns.map(f => f.name || f.description || f)})` : "",

	extendDefinition = (def, newParts = []) => {
		newParts = [].concat(newParts);
		if (newParts.length > 0) {
			def = newParts
				.reduce((def, ext) => def.concat(ext), [].concat(def)) // clone to lose ref
				.filter((value, index, self) => self.indexOf(value) === index); // remove duplicates
		}

		return def
	},

	check = (model, obj) => {
		model[_check](obj, null, model.errors, [], true);
		return !unstackErrors(model)
	},

	checkDefinition = (obj, def, path, errors, stack, shouldCast) => {
		let indexFound = stack.indexOf(def);
		if (indexFound !== -1 && stack.indexOf(def, indexFound + 1) !== -1)
			return obj // if found twice in call stack, cycle detected, skip validation

		if (Array.isArray(def) && def.length === 1 && obj != null) {
			def = def[0]; // shorten validation path for optionals
		}

		if (is(Model, def)) {
			if (shouldCast) obj = cast(obj, def);
			def[_check](obj, path, errors, stack.concat(def));
		}
		else if (isPlainObject(def)) {
			Object.keys(def).map(key => {
				let val = obj ? obj[key] : undefined;
				checkDefinition(val, def[key], formatPath(path, key), errors, stack, shouldCast);
			});
		}
		else {
			let pdef = parseDefinition(def);
			if (pdef.some(part => checkDefinitionPart(obj, part, path, stack))) {
				return shouldCast ? cast(obj, def) : obj
			}

			stackError(errors, def, obj, path);
		}

		return obj
	},

	checkDefinitionPart = (obj, def, path, stack, shouldCast) => {
		if (def === Any) return true
		if (obj == null) return obj === def
		if (isPlainObject(def) || is(Model, def)) { // object or model as part of union type
			let errors = [];
			checkDefinition(obj, def, path, errors, stack, shouldCast);
			return !errors.length
		}
		if (is(RegExp, def)) return def.test(obj)
		if (def === Number || def === Date) return obj.constructor === def && !isNaN(obj)
		return obj === def
			|| (isFunction(def) && is(def, obj))
			|| obj.constructor === def
	},

	checkAssertions = (obj, model, path, errors = model.errors) => {
		for (let assertion of model.assertions) {
			let result;
			try {
				result = assertion.call(model, obj);
			} catch (err) {
				result = err;
			}
			if (result !== true) {
				let onFail = isFunction(assertion.description) ? assertion.description : (assertionResult, value) =>
					`assertion "${assertion.description}" returned ${format(assertionResult)} `
					+ `for ${path ? path + " =" : "value"} ${format(value)}`;
				stackError(errors, assertion, obj, path, onFail.call(model, result, obj, path));
			}
		}
	},

	format = (obj, stack = []) => {
		if (stack.length > 15 || stack.includes(obj)) return "..."
		if (obj === null || obj === undefined) return String(obj)
		if (typeof obj === "string") return `"${obj}"`
		if (is(Model, obj)) return obj.toString(stack)

		stack.unshift(obj);

		if (isFunction(obj)) return obj.name || obj.toString()
		if (is(Map, obj) || is(Set, obj)) return format([...obj])
		if (Array.isArray(obj)) return `[${obj.map(item => format(item, stack)).join(", ")}]`
		if (obj.toString && obj.toString !== Object.prototype.toString) return obj.toString()
		if (isObject(obj)) {
			let props = Object.keys(obj),
				indent = "\t".repeat(stack.length);
			return `{${props.map(
				key => `\n${indent + key}: ${format(obj[key], [...stack])}`
			).join(", ")} ${props.length ? `\n${indent.slice(1)}` : ""}}`
		}

		return String(obj)
	},

	formatPath = (path, key) => path ? path + "." + key : key,

	controlMutation = (model, def, path, o, key, privateAccess, applyMutation) => {
		let newPath = formatPath(path, key),
			isPrivate = model.conventionForPrivate(key),
			isConstant = model.conventionForConstant(key),
			isOwnProperty = has(o, key),
			initialPropDescriptor = isOwnProperty && Object.getOwnPropertyDescriptor(o, key);

		if (key in def && ((isPrivate && !privateAccess) || (isConstant && o[key] !== undefined)))
			cannot(`modify ${isPrivate ? "private" : "constant"} property ${key}`, model);

		applyMutation(newPath);
		if (has(def, key)) checkDefinition(o[key], def[key], newPath, model.errors, []);
		checkAssertions(o, model, newPath);

		let nbErrors = model.errors.length;
		if (nbErrors) {
			if (isOwnProperty) Object.defineProperty(o, key, initialPropDescriptor);
			else delete o[key]; // back to the initial property defined in prototype chain

			unstackErrors(model);
		}

		return !nbErrors
	},

	cannot = (msg, model) => {
		model.errors.push({ message: "cannot " + msg });
	},

	cast = (obj, defNode = []) => {
		if (!obj || isPlainObject(defNode) || is(BasicModel, defNode) || isModelInstance(obj))
			return obj // no value or not leaf or already a model instance

		let def = parseDefinition(defNode),
			suitableModels = [];

		for (let part of def) {
			if (is(Model, part) && !is(BasicModel, part) && part.test(obj))
				suitableModels.push(part);
		}

		if (suitableModels.length === 1) {
			// automatically cast to suitable model when explicit (autocasting)
			return new suitableModels[0](obj, _checked)
		}

		if (suitableModels.length > 1)
			console.warn(`Ambiguous model for value ${format(obj)}, could be ${suitableModels.join(" or ")}`);

		return obj
	},


	getProp = (val, model, def, path, privateAccess) => {
		if (!isPlainObject(def)) return cast(val, def)
		return proxify(val, getTraps(model, def, path, privateAccess))
	},

	getTraps = (model, def, path, privateAccess) => {
		const grantPrivateAccess = f => proxify(f, {
			apply(fn, ctx, args) {
				privateAccess = true;
				let result = Reflect.apply(fn, ctx, args);
				privateAccess = false;
				return result
			}
		});

		return {
			getPrototypeOf: obj => path ? Object.prototype : getProto(obj),

			get(o, key) {
				if (key === _original) return o

				if (typeof key !== "string") return Reflect.get(o, key)

				let newPath = formatPath(path, key),
					defPart = def[key];

				if (!privateAccess && key in def && model.conventionForPrivate(key)) {
					cannot(`access to private property ${newPath}`, model);
					unstackErrors(model);
					return
				}

				if (o[key] && has(o, key) && !isPlainObject(defPart) && !isModelInstance(o[key])) {
					o[key] = cast(o[key], defPart); // cast nested models
				}

				if (isFunction(o[key]) && key !== "constructor" && !privateAccess) {
					return grantPrivateAccess(o[key])
				}

				if (isPlainObject(defPart) && !o[key]) {
					o[key] = {}; // null-safe traversal
				}

				return getProp(o[key], model, defPart, newPath, privateAccess)
			},

			set(o, key, val) {
				return controlMutation(model, def, path, o, key, privateAccess,
					newPath => Reflect.set(o, key, getProp(val, model, def[key], newPath))
				)
			},

			deleteProperty(o, key) {
				return controlMutation(model, def, path, o, key, privateAccess, () => Reflect.deleteProperty(o, key))
			},

			defineProperty(o, key, args) {
				return controlMutation(model, def, path, o, key, privateAccess, () => Reflect.defineProperty(o, key, args))
			},

			has(o, key) {
				return Reflect.has(o, key) && Reflect.has(def, key) && !model.conventionForPrivate(key)
			},

			ownKeys(o) {
				return Reflect.ownKeys(o).filter(key => Reflect.has(def, key) && !model.conventionForPrivate(key))
			},

			getOwnPropertyDescriptor(o, key) {
				let descriptor;
				if (!model.conventionForPrivate(key)) {
					descriptor = Object.getOwnPropertyDescriptor(def, key);
					if (descriptor !== undefined) descriptor.value = o[key];
				}

				return descriptor
			}
		}
	};


function Model(def, params) {
	return isPlainObject(def) ? new ObjectModel(def, params) : new BasicModel(def)
}

Object.assign(Model.prototype, {
	name: "Model",
	assertions: [],

	conventionForConstant: key => key.toUpperCase() === key,
	conventionForPrivate: key => key[0] === "_",

	toString(stack) {
		return has(this, "name") ? this.name : formatDefinition(this.definition, stack) + formatAssertions(this.assertions)
	},

	as(name) {
		define(this, "name", name);
		return this
	},

	defaultTo(val) {
		this.default = val;
		return this
	},

	[_check](obj, path, errors, stack) {
		checkDefinition(obj, this.definition, path, errors, stack);
		checkAssertions(obj, this, path, errors);
	},

	test(obj, errorCollector) {
		let model = this;
		while (!has(model, "errorCollector")) {
			model = getProto(model);
		}

		let initialErrorCollector = model.errorCollector,
			failed;

		model.errorCollector = errors => {
			failed = true;
			if (errorCollector) errorCollector.call(this, errors);
		};

		new this(obj); // may trigger errorCollector

		model.errorCollector = initialErrorCollector;
		return !failed
	},

	errorCollector(errors) {
		let e = new TypeError(errors.map(e => e.message).join("\n"));
		e.stack = e.stack.replace(/\n.*object-model(.|\n)*object-model.*/, ""); // blackbox objectmodel in stacktrace
		throw e
	},

	assert(assertion, description = format(assertion)) {
		define(assertion, "description", description);
		this.assertions = this.assertions.concat(assertion);
		return this
	}
});


function BasicModel(def) {
	return initModel(def, BasicModel)
}

extend(BasicModel, Model, {
	extend(...newParts) {
		let child = extendModel(new BasicModel(extendDefinition(this.definition, newParts)), this);
		for (let part of newParts) {
			if (is(BasicModel, part)) child.assertions.push(...part.assertions);
		}

		return child
	}
});

function ObjectModel(def) {
	return initModel(def, ObjectModel, Object, initObjectModel, model => getTraps(model, def), true)
}

extend(ObjectModel, Model, {
	defaultTo(obj) {
		let def = this.definition;
		for (let key in obj) {
			if (has(def, key)) {
				obj[key] = checkDefinition(obj[key], def[key], key, this.errors, [], true);
			}
		}
		unstackErrors(this);
		this.default = obj;
		return this
	},

	toString(stack) {
		return format(this.definition, stack)
	},

	extend(...newParts) {
		let definition = { ...this.definition },
			proto = { ...this.prototype },
			defaults = { ...this.default },
			newAssertions = [];

		for (let part of newParts) {
			if (is(Model, part)) {
				merge(definition, part.definition);
				merge(defaults, part.default);
				newAssertions.push(...part.assertions);
			}
			if (isFunction(part)) merge(proto, part.prototype);
			if (isObject(part)) merge(definition, part);
		}

		let submodel = extendModel(new ObjectModel(definition), this, proto).defaultTo(defaults);
		submodel.assertions = [...this.assertions, ...newAssertions];

		if (getProto(this) !== ObjectModel.prototype) { // extended class
			submodel.parentClass = this;
		}

		return submodel
	},

	[_check](obj, path, errors, stack, shouldCast) {
		if (isObject(obj)) {
			let def = this.definition;
			checkDefinition(obj[_original] || obj, def, path, errors, stack, shouldCast);
		}
		else stackError(errors, this, obj, path);

		checkAssertions(obj, this, path, errors);
	}
});

const Any = proxify(BasicModel(), {
	apply(target, ctx, [def]) {
		return Object.assign(Object.create(Any), { definition: def })
	}
});
Any.definition = Any;
Any.toString = () => "Any";

Any.remaining = function (def) { this.definition = def; };
extend(Any.remaining, Any, {
	toString() { return "..." + formatDefinition(this.definition) }
});
Any[Symbol.iterator] = function* () { yield new Any.remaining(this.definition); };

const initListModel = (base, constructor, def, init, clone, mutators, otherTraps) => {

	return initModel(def, constructor, base, init, model => Object.assign({
		getPrototypeOf: () => model.prototype,
		get(l, key) {
			if (key === _original) return l

			let val = l[key];
			return isFunction(val) ? proxify(val, {
				apply(fn, ctx, args) {
					if (has(mutators, key)) {
						// indexes of arguments to check def + cast
						let [begin, end = args.length - 1, getArgDef] = mutators[key];
						for (let i = begin; i <= end; i++) {
							let argDef = getArgDef ? getArgDef(i) : model.definition;
							args[i] = checkDefinition(
								args[i],
								argDef,
								`${base.name}.${key} arguments[${i}]`,
								model.errors,
								[],
								true
							);
						}

						if (model.assertions.length > 0) {
							let testingClone = clone(l);
							fn.apply(testingClone, args);
							checkAssertions(testingClone, model, `after ${key} mutation`);
						}

						unstackErrors(model);
					}

					return fn.apply(l, args)
				}
			}) : val
		}
	}, otherTraps))
};

function ArrayModel(initialDefinition) {
	let model = initListModel(
		Array,
		ArrayModel,
		initialDefinition,
		a => Array.isArray(a) ? a.map(arg => cast(arg, model.definition)) : a,
		a => [...a],
		{
			"copyWithin": [],
			"fill": [0, 0],
			"pop": [],
			"push": [0],
			"reverse": [],
			"shift": [],
			"sort": [],
			"splice": [2],
			"unshift": [0]
		},
		{
			set(arr, key, val) {
				return controlMutation$1(model, arr, key, val, (a, v) => a[key] = v, true)
			},

			deleteProperty(arr, key) {
				return controlMutation$1(model, arr, key, undefined, a => delete a[key])
			}
		}
	);

	return model
}

extend(ArrayModel, Model, {
	toString(stack) {
		return "Array of " + formatDefinition(this.definition, stack)
	},

	[_check](arr, path, errors, stack) {
		if (Array.isArray(arr))
			(arr[_original] || arr).forEach((a, i) => checkDefinition(a, this.definition, `${path || "Array"}[${i}]`, errors, stack));
		else stackError(errors, this, arr, path);

		checkAssertions(arr, this, path, errors);
	},

	extend(...newParts) {
		return extendModel(new ArrayModel(extendDefinition(this.definition, newParts)), this)
	}
});

let controlMutation$1 = (model, array, key, value, applyMutation, canBeExtended) => {
	let path = `Array[${key}]`;
	let isInDef = (+key >= 0 && (canBeExtended || key in array));
	if (isInDef) value = checkDefinition(value, model.definition, path, model.errors, [], true);

	let testArray = [...array];
	applyMutation(testArray);
	checkAssertions(testArray, model, path);
	let isSuccess = !unstackErrors(model);
	if (isSuccess) applyMutation(array, value);
	return isSuccess
};

function FunctionModel(...argsDef) {
	return initModel({ arguments: argsDef }, FunctionModel, Function, null, model => ({
		getPrototypeOf: () => model.prototype,

		get(fn, key) {
			return key === _original ? fn : fn[key]
		},

		apply(fn, ctx, args) {
			let def = model.definition,
				remainingArgDef = def.arguments.find(argDef => is(Any.remaining, argDef)),
				nbArgsToCheck = remainingArgDef ? Math.max(args.length, def.arguments.length - 1) : def.arguments.length;

			for (let i = 0; i < nbArgsToCheck; i++) {
				let argDef = remainingArgDef && i >= def.arguments.length - 1 ? remainingArgDef.definition : def.arguments[i];
				args[i] = checkDefinition(args[i], argDef, `arguments[${i}]`, model.errors, [], true);
			}

			checkAssertions(args, model, "arguments");

			let result;
			if (!model.errors.length) {
				result = Reflect.apply(fn, ctx, args);
				if ("return" in def)
					result = checkDefinition(result, def.return, "return value", model.errors, [], true);
			}
			unstackErrors(model);
			return result
		}
	}))
}

extend(FunctionModel, Model, {
	toString(stack = []) {
		let out = `Function(${this.definition.arguments.map(
			argDef => formatDefinition(argDef, [...stack])
		).join(", ")})`;

		if ("return" in this.definition) {
			out += " => " + formatDefinition(this.definition.return, stack);
		}
		return out
	},

	return(def) {
		this.definition.return = def;
		return this
	},

	extend(newArgs, newReturns) {
		let args = this.definition.arguments,
			mixedArgs = newArgs.map((a, i) => extendDefinition(i in args ? args[i] : [], newArgs[i])),
			mixedReturns = extendDefinition(this.definition.return, newReturns);
		return extendModel(new FunctionModel(...mixedArgs).return(mixedReturns), this)
	},

	[_check](f, path, errors) {
		if (!isFunction(f)) stackError(errors, "Function", f, path);
	}
});

function MapModel(initialKeyDefinition, initialValueDefinition) {
	let getDef = i => i === 0 ? model.definition.key : model.definition.value,
		model = initListModel(
			Map,
			MapModel,
			{ key: initialKeyDefinition, value: initialValueDefinition },
			it => isIterable(it) ? new Map([...it].map(pair => pair.map((x, i) => cast(x, getDef(i))))) : it,
			map => new Map(map),
			{
				"set": [0, 1, getDef],
				"delete": [],
				"clear": []
			}
		);

	return model
}

extend(MapModel, Model, {
	toString(stack) {
		return `Map of ${formatDefinition(this.definition.key, stack)} : ${formatDefinition(this.definition.value, stack)}`
	},

	[_check](map, path, errors, stack) {
		if (is(Map, map)) {
			path = path || "Map";
			for (let [key, value] of map) {
				checkDefinition(key, this.definition.key, `${path} key`, errors, stack);
				checkDefinition(value, this.definition.value, `${path}[${format(key)}]`, errors, stack);
			}
		} else stackError(errors, this, map, path);

		checkAssertions(map, this, path, errors);
	},

	extend(keyParts, valueParts) {
		return extendModel(new MapModel(
			extendDefinition(this.definition.key, keyParts),
			extendDefinition(this.definition.value, valueParts)
		), this)
	}
});

function SetModel(initialDefinition) {
	let model = initListModel(
		Set,
		SetModel,
		initialDefinition,
		it => isIterable(it) ? new Set([...it].map(val => cast(val, model.definition))) : it,
		set => new Set(set),
		{
			"add": [0, 0],
			"delete": [],
			"clear": []
		}
	);

	return model
}

extend(SetModel, Model, {
	toString(stack) {
		return "Set of " + formatDefinition(this.definition, stack)
	},

	[_check](set, path, errors, stack) {
		if (is(Set, set)) {
			for (let item of set.values()) {
				checkDefinition(item, this.definition, `${path || "Set"} value`, errors, stack);
			}
		} else stackError(errors, this, set, path);
		checkAssertions(set, this, path, errors);
	},

	extend(...newParts) {
		return extendModel(new SetModel(extendDefinition(this.definition, newParts)), this)
	}
});

export { Any, ArrayModel, BasicModel, FunctionModel, MapModel, Model, ObjectModel, SetModel };
