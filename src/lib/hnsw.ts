// import { HierarchicalNSW } from 'hnswlib-node';
// import { redis } from './db';
// import fs from 'fs';
// const numDimensions = 1536; // the length of data point vector that will be indexed.
// const maxElements = 6000; // the maximum number of data points.

// // declaring and intializing index.
// const index = new HierarchicalNSW('l2', numDimensions);
// index.initIndex(maxElements);

// export async function createManualIndex(
// 	keys: string[],
// 	debug: boolean = false
// ) {
// 	debug = true;
// 	const jsonData = JSON.stringify(keys);
// 	fs.writeFile('test.json', jsonData, (err) => {
// 		console.log('error with json', err);
// 	});
// 	try {
// 		for (let i = 0; i < keys.length; i++) {
// 			// @ts-ignore
// 			const embedding: Array<string> = await redis.json.get(keys[i], {
// 				path: '$.embedding',
// 			});
// 			const point = embedding[0];
// 			let parsedPoint = JSON.parse(point);

// 			if (debug) console.log(parsedPoint[0]);
// 			index.addPoint(parsedPoint[0], i);
// 		}
// 		index.writeIndexSync('foo.dat');
// 		return 'file written';
// 	} catch (e) {
// 		if (debug) console.log(e);
// 		throw new Error('Error with creating manual index');
// 	}
// }

// export async function searchManualIndex(
// 	embed: any,
// 	debug: boolean = false
// ): Promise<any> {
// 	debug = true;

// 	const index = new hnsw('l2', numDimensions);
// 	index.readIndexSync('foo.dat');

// 	// preparing query data points.
// 	const query = JSON.parse(JSON.stringify(embed));
// 	console.log('Query: ', query);

// 	// searching k-nearest neighbor data points.
// 	const numNeighbors = 100;
// 	const result = index.searchKnn(query, numNeighbors);
// 	fs.readFile('test.json', 'utf8', async (err, data) => {
// 		const arr = JSON.parse(data);
// 		const items = [];
// 		console.log('distances: ', result.distances);
// 		for (const index in result.neighbors) {
// 			console.log('item: ', arr[index]);
// 			const item = await redis.json.get(arr[index]);
// 			console.log(item);
// 			items.push(item);
// 		}
// 		return items;
// 	});
// }
