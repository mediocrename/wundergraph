import { useCallback, useState, useEffect, Context } from 'react';

import type {
	InternalMutationArgsWithInput,
	InternalQueryArgsWithInput,
	InternalSubscriptionArgsWithInput,
	SubscriptionArgsWithInput,
	MutationArgsWithInput,
	MutationResult,
	QueryArgs,
	QueryArgsWithInput,
	QueryResult,
	SubscriptionResult,
	UploadConfig,
	SubscriptionArgs,
	MutationArgs,
	InternalMutationArgs,
} from '@wundergraph/sdk/client';

import { useWunderGraphContext, WunderGraphContextProperties } from './provider';

export interface LogoutOptions {
	logout_openid_connect_provider?: boolean;
}

export interface UseQueryOptions<Role> extends QueryArgs {
	context?: Context<WunderGraphContextProperties<Role> | undefined>;
	requiresAuthentication?: boolean;
}

export type UseQueryReturn<Input, Data> = {
	data?: Data;
	isLoading?: boolean;
	isSuccess?: boolean;
	isError?: boolean;
	isLazy?: boolean;
	refetch: (input?: Input, args?: QueryArgs) => void;
} & QueryResult<Data>;

export function useQuery<Input, Data, Role>(
	operationName: string,
	input?: Input,
	options: UseQueryOptions<Role> = {}
): UseQueryReturn<Input, Data> {
	const { context, requiresAuthentication, ...args } = options;

	const argsWithInput: QueryArgsWithInput<Input | undefined> = { input, ...args };

	const { ssrCache, client, isWindowFocused, refetchMountedOperations, user } = useWunderGraphContext<Role>(context, {
		name: 'useQuery',
	});

	const isServer = typeof window === 'undefined';
	const ssrEnabled = args?.disableSSR !== true && args?.lazy !== true;
	const cacheKey = client.cacheKey({
		operationName,
		...argsWithInput,
	});

	if (isServer) {
		if (options?.requiresAuthentication && user === null) {
			ssrCache[cacheKey] = {
				status: 'requires_authentication',
			};
			return {
				...(ssrCache[cacheKey] as QueryResult<Data>),
				refetch: () => {},
			};
		}
		if (ssrEnabled) {
			if (ssrCache[cacheKey]) {
				const result = ssrCache[cacheKey] as QueryResult<Data>;
				return {
					...result,
					isLoading: result.status === 'loading',
					isSuccess: result.status === 'ok',
					isError: result.status === 'error',
					isLazy: result.status === 'lazy',
					refetch: () => Promise.resolve(result),
				};
			}
			const promise = client.query<Input, Data>({
				operationName,
				...args,
			});
			ssrCache[cacheKey] = promise;
			throw promise;
		} else {
			ssrCache[cacheKey] = {
				status: 'none',
			};
			return {
				...(ssrCache[cacheKey] as QueryResult<Data>),
				refetch: () => ({}),
			};
		}
	}
	const [invalidate, setInvalidate] = useState<number>(0);
	const [debounce, setDebounce] = useState<number>(0);
	const [statefulArgs, setStatefulArgs] = useState<InternalQueryArgsWithInput<Input | undefined> | undefined>(
		argsWithInput
	);
	const [lazy] = useState(args?.lazy === true);
	const [lastCacheKey, setLastCacheKey] = useState<string>('');
	const [refetchOnWindowFocus] = useState(args?.refetchOnWindowFocus === true);
	const [queryResult, setQueryResult] = useState<QueryResult<Data>>(
		(ssrCache[cacheKey] as QueryResult<Data>) || { status: 'none' }
	);
	useEffect(() => {
		if (debounce === 0) {
			return;
		}
		const cancel = setTimeout(() => {
			setInvalidate((prev) => prev + 1);
		}, args?.debounceMillis || 0);
		return () => clearTimeout(cancel);
	}, [debounce]);
	useEffect(() => {
		if (lastCacheKey === '') {
			setLastCacheKey(cacheKey);
			return;
		}
		if (lastCacheKey === cacheKey) {
			return;
		}
		setLastCacheKey(cacheKey);
		setStatefulArgs(argsWithInput);
		if (args?.debounceMillis !== undefined) {
			setDebounce((prev) => prev + 1);
			return;
		}
		setInvalidate(invalidate + 1);
	}, [cacheKey]);
	useEffect(() => {
		if (queryResult?.status === 'lazy' || queryResult?.status === 'none') {
			return;
		}
		setInvalidate((prev) => prev + 1);
	}, [refetchMountedOperations]);
	useEffect(() => {
		if (options?.requiresAuthentication && user === null) {
			setQueryResult({
				status: 'requires_authentication',
			});
			return;
		}
		if (lazy && invalidate === 0) {
			setQueryResult({
				status: 'lazy',
			});
			return;
		}
		const abort = new AbortController();
		if (queryResult?.status === 'ok') {
			setQueryResult({ ...queryResult, refetching: true });
		} else {
			setQueryResult({ status: 'loading' });
		}
		(async () => {
			const result = await client.query<Input, Data>({
				operationName,
				...statefulArgs,
				abortSignal: abort.signal,
			});
			setQueryResult(result as QueryResult<Data>);
		})();
		return () => {
			abort.abort();
			setQueryResult({ status: 'cancelled' });
		};
	}, [invalidate, user]);
	useEffect(() => {
		if (!refetchOnWindowFocus) {
			return;
		}
		if (isWindowFocused !== 'focused') {
			return;
		}
		setInvalidate((prev) => prev + 1);
	}, [refetchOnWindowFocus, isWindowFocused]);
	const refetch = useCallback((input?: Input, args?: QueryArgs) => {
		if (input !== undefined || args !== undefined) {
			const argsWithInput = {
				input,
				...args,
			};
			setStatefulArgs(argsWithInput);
		}
		setInvalidate((prev) => prev + 1);
	}, []);
	return {
		...(queryResult as QueryResult<Data>),
		isLoading: queryResult.status === 'loading',
		isSuccess: queryResult.status === 'ok',
		isError: queryResult.status === 'error',
		isLazy: queryResult.status === 'lazy',
		refetch,
	};
}

export interface UseSubscriptionOptions<Role> extends SubscriptionArgs {
	context?: Context<WunderGraphContextProperties<Role> | undefined>;
	requiresAuthentication?: boolean;
	isLiveQuery?: boolean;
}

export type UseSubscriptionReturn<Input, Data> = {
	data?: Data;
	isLoading?: boolean;
	isSuccess?: boolean;
	isStopped?: boolean;
	isError?: boolean;
} & SubscriptionResult<Data>;

export function useSubscription<Input, Data, Role>(
	operationName: string,
	input?: Input,
	options: UseSubscriptionOptions<Role> = {}
): UseSubscriptionReturn<Input, Data> {
	const { context, requiresAuthentication, ...args } = options;

	const argsWithInput: SubscriptionArgsWithInput<Input | undefined> = { input, ...args };

	const { ssrCache, client, isWindowFocused, refetchMountedOperations, user } = useWunderGraphContext(
		options?.context,
		{ name: 'useSubscription' }
	);
	const isServer = typeof window === 'undefined';
	const ssrEnabled = args?.disableSSR !== true;
	const cacheKey = client.cacheKey({
		operationName,
		...argsWithInput,
	});
	if (isServer) {
		if (options?.requiresAuthentication && user === null) {
			ssrCache[cacheKey] = {
				status: 'requires_authentication',
			};
			return {
				...(ssrCache[cacheKey] as SubscriptionResult<Data>),
			};
		}
		if (ssrEnabled) {
			if (ssrCache[cacheKey]) {
				return {
					...(ssrCache[cacheKey] as SubscriptionResult<Data>),
				};
			}
			const promise = client.query({ operationName, ...argsWithInput, subscribeOnce: true });
			ssrCache[cacheKey] = promise;
			throw promise;
		} else {
			ssrCache[cacheKey] = {
				status: 'none',
			};
			return {
				...(ssrCache[cacheKey] as SubscriptionResult<Data>),
			};
		}
	}
	const [invalidate, setInvalidate] = useState<number>(0);
	const [subscriptionResult, setSubscriptionResult] = useState<SubscriptionResult<Data>>(
		(ssrCache[cacheKey] as SubscriptionResult<Data>) || { status: 'none' }
	);
	const stopOnWindowBlur = args?.stopOnWindowBlur === true;
	const stop = !stopOnWindowBlur || isWindowFocused === 'focused' ? false : true;
	useEffect(() => {
		if (options?.requiresAuthentication && user === null) {
			setSubscriptionResult({
				status: 'requires_authentication',
			});
			return;
		}
		if (stop) {
			if (subscriptionResult?.status === 'ok') {
				setSubscriptionResult({ ...subscriptionResult, streamState: 'stopped' });
			} else {
				setSubscriptionResult({ status: 'none' });
			}
			return;
		}
		if (subscriptionResult?.status === 'ok') {
			setSubscriptionResult({ ...subscriptionResult, streamState: 'restarting' });
		} else {
			setSubscriptionResult({ status: 'loading' });
		}
		const abort = new AbortController();
		client.subscribe(
			{
				operationName,
				...argsWithInput,
				abortSignal: abort.signal,
			},
			(result: SubscriptionResult<Data>) => {
				setSubscriptionResult(result);
			}
		);
		return () => {
			abort.abort();
		};
	}, [stop, refetchMountedOperations, invalidate, user]);
	useEffect(() => {
		if (args?.debounceMillis === undefined) {
			setInvalidate((prev) => prev + 1);
			return;
		}
		const cancel = setTimeout(() => {
			setInvalidate((prev) => prev + 1);
		}, args.debounceMillis);
		return () => {
			clearTimeout(cancel);
		};
	}, [cacheKey]);
	return {
		...(subscriptionResult as SubscriptionResult<Data>),
		isLoading: subscriptionResult.status === 'loading',
		isSuccess: subscriptionResult.status === 'ok',
		isStopped: subscriptionResult.status === 'ok' && stop,
		isError: subscriptionResult.status === 'error',
	};
}

export interface UseMutationOptions<Role> extends MutationArgs {
	context?: Context<WunderGraphContextProperties<Role> | undefined>;
	requiresAuthentication?: boolean;
}

export type UseMutationReturn<Input, Data> = {
	data?: Data;
	isLoading?: boolean;
	isSuccess?: boolean;
	isError?: boolean;
	mutate: (input?: Input, args?: MutationArgs) => Promise<MutationResult<Data>>;
} & MutationResult<Data>;

export function useMutation<Input, Data, Role>(
	operationName: string,
	options: UseMutationOptions<Role>
): UseMutationReturn<Input, Data> {
	const { client, setRefetchMountedOperations, user } = useWunderGraphContext(options.context, {
		name: 'useMutation',
	});
	const [result, setResult] = useState<MutationResult<Data>>(
		options?.requiresAuthentication && user === null ? { status: 'requires_authentication' } : { status: 'none' }
	);
	const mutate = useCallback(
		async (input?: Input, args?: InternalMutationArgs): Promise<MutationResult<Data>> => {
			if (options?.requiresAuthentication && user === null) {
				return { status: 'requires_authentication' };
			}
			setResult({ status: 'loading' });
			const result = await client.mutate({ operationName, input, ...args });
			setResult(result as any);
			if (result.status === 'ok' && args?.refetchMountedOperationsOnSuccess === true) {
				setRefetchMountedOperations((prev) => prev + 1);
			}
			return result as any;
		},
		[user]
	);
	useEffect(() => {
		if (!options?.requiresAuthentication) {
			return;
		}
		if (user === null) {
			if (result.status !== 'requires_authentication') {
				setResult({ status: 'requires_authentication' });
			}
			return;
		}
		if (result.status !== 'none') {
			setResult({ status: 'none' });
		}
	}, [user]);
	return {
		...result,
		isLoading: result.status === 'loading',
		isSuccess: result.status === 'ok',
		isError: result.status === 'error',
		mutate,
	};
}

export interface UseWunderGraphProps<Role> {
	context?: Context<WunderGraphContextProperties<Role> | undefined>;
}

export function useWunderGraph<Role, AuthProviders extends string = '', S3Providers extends string = ''>(
	props: UseWunderGraphProps<Role>
) {
	const { user, client, setUser } = useWunderGraphContext<Role>(props.context, { name: 'useWunderGraph' });
	const login = useCallback(
		(provider: AuthProviders, redirectUri?: string) => {
			client.login(provider, redirectUri);
		},
		[client]
	);
	const logout = useCallback(
		async (options?: LogoutOptions) => {
			const success = await client.logout(options);
			if (success) {
				setUser(null);
			}
			return success;
		},
		[client]
	);
	const fetchUser = useCallback(async () => {
		try {
			const user = await client.fetchUser();
			setUser(user);
			return user;
		} catch {
			setUser(null);
			return null;
		}
	}, [client]);
	const uploadFiles = useCallback(
		async (config: UploadConfig<S3Providers>) => {
			return client.uploadFiles(config);
		},
		[client]
	);
	return {
		user,
		logout,
		login,
		fetchUser,
		uploadFiles,
	};
}