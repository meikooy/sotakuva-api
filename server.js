// Load .env
require('dotenv').load();

const express = require('express');
const mongoose = require('mongoose');
const Image = require('./image');
const Kraken = require('kraken');
const sharp = require('sharp');
const request = require('request');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

// Initialize Kraken
const kraken = new Kraken({
    'api_key': process.env.KRAKEN_API_KEY,
    'api_secret': process.env.KRAKEN_API_SECRET
});

// Connect mongoose
mongoose.connect(process.env.MONGODB_URI);
mongoose.Promise = global.Promise;

// Initialize express
const app = express();
const port = process.env.PORT || 3000;

// Sample route
app.get('/', function (req, res) {
	res.send('Rintamalla API');
});

// Image resizer url
app.get('/images/:id/file', function(req, res) {
	const id = req.params.id;

	// Validate size
	const size = req.query.size;
	const availableSizes = [
		'thumbnail',
		'large'
	];

	if (availableSizes.indexOf(size) === -1) {
		return res.status(400).send('Invalid size. Available sizes are ' + availableSizes.join(', '));
	}

	if (!id) {
		return res.status(400).send('Invalid id');	
	}

	console.log('find image ' + id);

	// Get image
	Image.findById(id).then(
		image => {

			//
			// Resize
			// 

			const sizeKey = `s3_${size}_url`;

			// Check if size exists
			if (!image[sizeKey]) {

				// If we are fetching thumbnail and we already have the 
				// large file use it instead to save bandwith
				var url = image.image_url;
				if (size === 'thumbnail' && image['s3_large_url']) {
					url = image['s3_large_url'];
				}

				request.get({url, encoding: null}, function (_, _, body) {

					var func = null;
					if (size === 'thumbnail') {
						func = sharp(body)
							.resize(null, 700)
							.max()
					}
					else if(size === 'large') {
						func = sharp(body)
							.resize(1800, null)
							.max()
					}

					func.toBuffer((err, buffer, info) => {
						if (err) {
							console.log(err);
							return res.status(500).send('Resize failed.');
						}

						const path = `images/${id}_${size}.jpg`;
						s3.putObject({
							Bucket: process.env.S3_BUCKET,
							Key: path,
							ACL: 'public-read',
							ContentDisposition: 'inline',
							ContentType: 'image/jpg',
							Body: buffer
						}, (err, data) => {
							if (err) {
								console.log(err);
								return res.status(500).send('S3 upload failed.');
							}

							
							// Save the optimized url
					        image[sizeKey] = 'http://images.rintamalla.fi/' + path;
					        console.log(image);
					        image.save().then(
					        	image => {
					        		
					        		// Redirect to optimized url
					        		res.redirect(301, image[sizeKey]);

					        	}, error => {
						        	console.log(error);
						        	res.status(500).send('Image saving failed');
					        	}
					        );
						});
					});
				});

				
				return;



				// 
				// Pass to kraken. Disabled for now.
				// 
				
				const params = {
				    url: url,
				    lossy: true,
				    resize: resizes[size],
				    s3_store: {
				        key: process.env.AWS_ACCESS_KEY_ID,
				        secret: process.env.AWS_SECRET_ACCESS_KEY,
				        bucket: process.env.S3_BUCKET,
				        region: process.env.S3_REGION,
				        path: `images/${id}_${size}`
				    },
				    wait: true
				};
				kraken.url(params, function(status) {
				    if (status.success) {
				        
				        // Save the optimized url
				        image[sizeKey] = status.kraked_url;
				        image.save().then(
				        	image => {

				        		// Redirect to optimized url
				        		res.redirect(301, image[sizeKey]);

				        	}, error => {
					        	console.log(error);
					        	res.status(500).send('Image saving failed');
				        	}
				        );

				    } else {
				    	console.log(status);
				    	res.status(500).send('Image resize failed. Error: ' + status.message);
				    }
				});

			}
			else {

				// Redirect to optimized url
				res.redirect(301, image[sizeKey]);

			}
		},
		error => {
			res.status(404).send('Image not found');
		}
	);

});

app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});