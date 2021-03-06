/*
 * View model for OctoPrint-Slicer
 *
 * Author: Kenneth Jiang
 * License: AGPLv3
 */
$(function() {
    function SlicerViewModel(parameters) {
        var self = this;
        self.canvas = document.getElementById( 'slicer-canvas' );

        //check if webGL is present. If not disable Slicer plugin
        try {
            var ctx = self.canvas.getContext('webgl') || self.canvas.getContext('experimental-webgl');
            var exts = ctx.getSupportedExtensions();
        }
        catch (e) {
            $('#tab_plugin_slicer').empty().append("<h3>Slicer Plugin is disabled because your browser doesn't support WebGL</h3>");
            return;
        }

        // assign the injected parameters, e.g.:
        // self.loginStateViewModel = parameters[0];
        // self.settingsViewModel = parameters[1];
        self.slicingViewModel = parameters[0];
        self.basicOverridesViewModel = parameters[1];
        self.advancedOverridesViewModel = parameters[2];

        self.lockScale = true;

        // Override slicingViewModel.show to surpress default slicing behavior
        self.slicingViewModel.show = function(target, file, force) {
            var filename = file.substr(0, file.lastIndexOf("."));
            if (filename.lastIndexOf("/") != 0) {
                filename = filename.substr(filename.lastIndexOf("/") + 1);
            }

            self.slicingViewModel.requestData();
            self.slicingViewModel.target = target;
            self.slicingViewModel.file(file);
            self.slicingViewModel.destinationFilename(filename);
            self.slicingViewModel.printerProfile(self.slicingViewModel.printerProfiles.currentProfile());

            $('a[href="#tab_plugin_slicer"]').tab('show');
            self.loadSTL(target, file, force);
        };

        // Print bed size
        self.BEDSIZE_X_MM = 200;
        self.BEDSIZE_Y_MM = 200;
        self.BEDSIZE_Z_MM = 200;
        self.ORIGIN_OFFSET_X_MM = 0;
        self.ORIGIN_OFFSET_Y_MM = 0;

        self.updatePrinterProfile = function(printerProfile) {
            if (! self.printerProfiles) {
                $.ajax({
                    url: API_BASEURL + "printerprofiles",
                    type: "GET",
                    dataType: "json",
                    success: function(data) {
                        self.printerProfiles = data;
                        self.updatePrinterBed(printerProfile);
                    }
                });
            } else {
                self.updatePrinterBed(printerProfile);
            }
        }

        self.slicingViewModel.printerProfile.subscribe( self.updatePrinterProfile );

        self.updatePrinterBed = function(printerProfile) {
            if ( self.printerProfiles && printerProfile ) {
                var dim = self.printerProfiles.profiles[printerProfile].volume
                self.BEDSIZE_X_MM = dim.width;
                self.BEDSIZE_Y_MM = dim.depth;
                self.BEDSIZE_Z_MM = dim.height;
                if ( self.printerProfiles.profiles[printerProfile]["volume"]["origin"] == "lowerleft" ) {
                    self.ORIGIN_OFFSET_X_MM = self.BEDSIZE_X_MM/2.0;
                    self.ORIGIN_OFFSET_Y_MM = self.BEDSIZE_Y_MM/2.0;
                } else {
                    self.ORIGIN_OFFSET_X_MM = 0;
                    self.ORIGIN_OFFSET_Y_MM = 0;
                }
            }
            self.drawBedFloor(self.BEDSIZE_X_MM, self.BEDSIZE_Y_MM);
            self.drawWalls(self.BEDSIZE_X_MM, self.BEDSIZE_Y_MM, self.BEDSIZE_Z_MM);
        }

        var CANVAS_WIDTH = 588,
            CANVAS_HEIGHT = 588;

        var effectController = {
                    shininess: 40.0,
                    ka: 0.17,
                    kd: 0.625,
                    ks: 0.55,
                    hue:        0.121,
                    saturation: 0.73,
                    lightness:  0.66,
                    lhue:        0.04,
                    lsaturation: 0.01,  // non-zero so that fractions will be shown
                    llightness:  1.0,
                };

        self.init = function() {
            self.camera = new THREE.PerspectiveCamera( 45, 1.0, 0.1, 5000 );
            self.camera.up.set( 0, 0, 1 );
            self.camera.position.set( -100, -200, 250 );
            self.scene = new THREE.Scene();

            // Lights
            var ambientLight = new THREE.AmbientLight( 0x333333 );  // 0.2
            ambientLight.color.setHSL( effectController.hue, effectController.saturation, effectController.lightness * effectController.ka );
            self.scene.add( ambientLight );
            var directionalLight = new THREE.DirectionalLight( 0xffffff, 1.0);
            directionalLight.color.setHSL( effectController.lhue, effectController.lsaturation, effectController.llightness );
            directionalLight.position.set( 100, 100, 500 );
            self.scene.add( directionalLight );
            var directionalLight2= new THREE.DirectionalLight( 0xffffff, 1.0);
            directionalLight2.color.setHSL( effectController.lhue, effectController.lsaturation, effectController.llightness );
            directionalLight2.position.set( 100, 100, -500);
            self.scene.add( directionalLight2);

            //Walls and Floor
            self.walls = new THREE.Object3D();
            self.floor = new THREE.Object3D();
            self.scene.add(self.walls);
            self.scene.add(self.floor);

            self.renderer = new THREE.WebGLRenderer( { canvas: self.canvas, antialias: true } );
            self.renderer.setClearColor( 0xd8d8d8 );
            self.renderer.setSize( CANVAS_WIDTH, CANVAS_HEIGHT );
            self.renderer.setPixelRatio( window.devicePixelRatio );

            self.renderer.gammaInput = true;
            self.renderer.gammaOutput = true;

            $("#slicer-viewport").empty().append('<div class="model">\
                    <button class="translate" title="Move"><img src="'
                + PLUGIN_BASEURL
                + 'slicer/static/img/translate.png"></button>\
                    <button class="rotate disabled" title="Rotate"><img src="'
                + PLUGIN_BASEURL
                + 'slicer/static/img/rotate.png"></button>\
                    <button class="scale disabled" title="Scale"><img src="'
                + PLUGIN_BASEURL
                + 'slicer/static/img/scale.png"></button>\
                </div>\
                <div class="values translate">\
                    <div>\
                        <p><span class="axis x">X</span><input type="number" step="any" name="x"><span title="">mm</span></p>\
                        <p><span class="axis y">Y</span><input type="number" step="any" name="y"><span title="">mm</span></p>\
                        <span></span>\
                    </div>\
               </div>\
                <div class="values rotate">\
                    <div>\
                        <p><span class="axis x">X</span><input type="number" step="any" name="x"><span title="">°</span></p>\
                        <p><span class="axis y">Y</span><input type="number" step="any" name="y"><span title="">°</span></p>\
                        <p><span class="axis z">Z</span><input type="number" step="any" name="z"><span title="">°</span></p>\
                        <span></span>\
                    </div>\
               </div>\
                <div class="values scale">\
                    <div>\
                        <p><span class="axis x">X</span><input type="number" step="0.001" name="x" min="0.001"></p>\
                        <p><span class="axis y">Y</span><input type="number" step="0.001" name="y" min="0.001"></p>\
                        <p><span class="axis z">Z</span><input type="number" step="0.001" name="z" min="0.001"></p>\
                        <p class="checkbox"><label><input type="checkbox" checked>Lock</label></p>\
                        <span></span>\
                    </div>\
               </div>');

            $("#slicer-viewport").append(self.renderer.domElement);
            self.orbitControls = new THREE.OrbitControls(self.camera, self.renderer.domElement);
            self.orbitControls.enableDamping = true;
            self.orbitControls.dampingFactor = 0.25;
            self.orbitControls.enablePan = false;
            self.orbitControls.addEventListener("change", self.render);

            self.transformControls = new THREE.TransformControls(self.camera, self.renderer.domElement);
            self.transformControls.space = "world";
            //self.transformControls.setAllowedTranslation("XY");
            //self.transformControls.setRotationDisableE(true);
            self.transformControls.setRotationSnap( THREE.Math.degToRad( 15 ) )
            self.transformControls.addEventListener("change", self.render);
            self.transformControls.addEventListener("mouseDown", self.startTransform);
            self.transformControls.addEventListener("mouseUp", self.endTransform);
            self.transformControls.addEventListener("change", self.updateTransformInputs);
            self.scene.add(self.transformControls);
            self.updatePrinterBed();

            $("#slicer-viewport button.translate").click(function(event) {
                // Set selection mode to translate
                self.transformControls.setMode("translate");
                self.toggleValueInputs($("#slicer-viewport .translate.values div"));
            });
            $("#slicer-viewport button.rotate").click(function(event) {
                // Set selection mode to rotate
                self.transformControls.setMode("rotate");
                self.toggleValueInputs($("#slicer-viewport .rotate.values div"));
            });
            $("#slicer-viewport button.scale").click(function(event) {
				// Set selection mode to scale
				self.transformControls.setMode("scale");
                self.toggleValueInputs($("#slicer-viewport .scale.values div"));
            });
            $("#slicer-viewport .values input").change(function() {
                self.applyChange($(this));
            });

            ko.applyBindings(self.slicingViewModel, $('#slicing-settings')[0]);

            window.addEventListener( 'keydown', function ( event ) {
                switch ( event.keyCode ) {
                    case 17: // Ctrl
                        self.transformControls.setRotationSnap(null);
                        break;
                }
            });

            window.addEventListener( 'keyup', function ( event ) {
                switch ( event.keyCode ) {
                    case 17: // Ctrl
                        self.transformControls.setRotationSnap( THREE.Math.degToRad( 15 ) );
                        break;
                }
            });

        };

        self.loadSTL = function(target, file) {
            if (self.model) {
                self.scene.remove(self.model);
                self.transformControls.detach();
            }

            var loader = new THREE.STLLoader();
            loader.load(BASEURL + "downloads/files/" + target + "/" + file, function ( geometry ) {
                var diffuseColor = new THREE.Color();
                diffuseColor.setHSL( effectController.hue, effectController.saturation, effectController.lightness );
                var specularColor = new THREE.Color();
                specularColor.copy( diffuseColor );
                diffuseColor.multiplyScalar( effectController.kd );
                specularColor.multiplyScalar( effectController.ks );
                var material = new THREE.MeshPhongMaterial({ color: diffuseColor, specular: specularColor, shading: THREE.SmoothShading, side: THREE.DoubleSide, shininess: effectController.shininess });

                // center model's origin
                var stlModel = new THREE.Mesh( geometry, material );
                var center = new THREE.Box3().setFromObject(stlModel).center()
                self.model = new THREE.Object3D();
                self.model.add(stlModel);
                stlModel.position.copy(center.negate());

                self.scene.add( self.model );
                self.transformControls.attach(self.model);
                self.transformControls.setMode("rotate");
                self.updateTransformInputs();
                self.render();
            } );
        };

        self.toggleValueInputs = function(parentDiv) {
            if ( parentDiv.hasClass("show") ) {
                parentDiv.removeClass("show").children('p').removeClass("show");
            } else {
                $("#slicer-viewport .values div").removeClass("show");
                parentDiv.addClass("show").children('p').addClass("show");
            }
        };

        self.applyChange = function(input) {
            input.blur();
            if(input[0].type == "checkbox") {
                self.lockScale = input[0].checked;
            }
            else if(input[0].type == "number" && !isNaN(parseFloat(input.val()))) {
                input.val(parseFloat(input.val()).toFixed(3));
                var model = self.transformControls.object;

                if (input.closest(".values").hasClass("scale") && self.lockScale) {
                    $("#slicer-viewport .scale.values input").val(input.val());
                console.log($("#slicer-viewport .scale.values input[name=\"x\"]").val());
                }

                model.position.x =  parseFloat($("#slicer-viewport .translate.values input[name=\"x\"]").val())
                model.position.y =  parseFloat($("#slicer-viewport .translate.values input[name=\"y\"]").val())
                model.rotation.x =  THREE.Math.degToRad($("#slicer-viewport .rotate.values input[name=\"x\"]").val());
                model.rotation.y =  THREE.Math.degToRad($("#slicer-viewport .rotate.values input[name=\"y\"]").val());
                model.rotation.z =  THREE.Math.degToRad($("#slicer-viewport .rotate.values input[name=\"z\"]").val());
                model.scale.x =  parseFloat($("#slicer-viewport .scale.values input[name=\"x\"]").val())
                model.scale.y =  parseFloat($("#slicer-viewport .scale.values input[name=\"y\"]").val())
                model.scale.z =  parseFloat($("#slicer-viewport .scale.values input[name=\"z\"]").val())
                self.fixZPosition(model);
                self.render();
            }
        };

        self.startTransform = function () {
            // Disable orbit controls
            self.orbitControls.enabled = false;
        };

        self.endTransform = function () {
            // Enable orbit controls
            self.orbitControls.enabled = true;
        };

        self.updateTransformInputs = function () {
            var model = self.transformControls.object;
            $("#slicer-viewport .translate.values input[name=\"x\"]").val(model.position.x.toFixed(3)).attr("min", '');
            $("#slicer-viewport .translate.values input[name=\"y\"]").val(model.position.y.toFixed(3)).attr("min", '');
            $("#slicer-viewport .rotate.values input[name=\"x\"]").val((model.rotation.x * 180 / Math.PI).toFixed(3)).attr("min", '');
            $("#slicer-viewport .rotate.values input[name=\"y\"]").val((model.rotation.y * 180 / Math.PI).toFixed(3)).attr("min", '');
            $("#slicer-viewport .rotate.values input[name=\"z\"]").val((model.rotation.z * 180 / Math.PI).toFixed(3)).attr("min", '');
            $("#slicer-viewport .scale.values input[name=\"x\"]").val(model.scale.x.toFixed(3)).attr("min", '');
            $("#slicer-viewport .scale.values input[name=\"y\"]").val(model.scale.y.toFixed(3)).attr("min", '');
            $("#slicer-viewport .scale.values input[name=\"z\"]").val(model.scale.z.toFixed(3)).attr("min", '');
            $("#slicer-viewport .scale.values input[type=\"checkbox\"]").checked = self.lockScale;
            self.fixZPosition(model);
            self.render();
        };

        self.createText = function(font, text, width, depth, parentObj) {
            var textGeometry = new THREE.TextGeometry( text, {
              font: font,
              size: 10,
              height: 0.1,
              material: 0, extrudeMaterial: 1
            });
            var materialFront = new THREE.MeshBasicMaterial( { color: 0x048e06} );
            var materialSide = new THREE.MeshBasicMaterial( { color: 0x8A8A8A} );
            var materialArray = [ materialFront, materialSide ];
            var textMaterial = new THREE.MeshFaceMaterial(materialArray);

            var mesh = new THREE.Mesh( textGeometry, textMaterial );
            textGeometry.computeBoundingBox();
            var textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
            var textHeight = textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y;
            switch (text) {
                case "Front":
                    mesh.position.set(-textWidth/2.0, -depth/2.0, 1.0);
                    break;
                case "Back":
                    mesh.position.set(-textWidth/2.0, depth/2.0-textHeight, 1.0);
                    break;
                case "Left":
                    mesh.position.set(-width/2.0, -textHeight/2, 1.0);
                    break;
                case "Right":
                    mesh.position.set(width/2.0-textWidth, -textHeight/2, 1.0);
                    break;
            }
            parentObj.add(mesh);
        };

        self.drawBedFloor = function ( width, depth, segments ) {
            for(var i = self.floor.children.length - 1; i >= 0; i--) {
                 var obj = self.floor.children[i];
                 self.floor.remove(obj);
            }

            segments = segments || 20;
            var geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
            var materialEven = new THREE.MeshBasicMaterial({color: 0xccccfc});
            var materialOdd = new THREE.MeshBasicMaterial({color: 0x444464});
            var materials = [materialEven, materialOdd];
            for (var x = 0; x < segments; x++) {
              for (var y = 0; y < segments; y++) {
                var i = x * segments + y;
                var j = 2 * i;
                geometry.faces[ j ].materialIndex = geometry.faces[ j + 1 ].materialIndex = (x + y) % 2;
              }
            }
            var mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial(materials));
            mesh.receiveShadow = true;
            self.floor.add(mesh);

            //Add text to indicate front/back of print bed
            var loader = new THREE.FontLoader();
            loader.load( PLUGIN_BASEURL + "slicer/static/js/optimer_bold.typeface.json", function ( font ) {
                self.createText(font, "Front", width, depth, self.floor);
                self.createText(font, "Back", width, depth, self.floor);
                self.createText(font, "Left", width, depth, self.floor);
                self.createText(font, "Right", width, depth, self.floor);
                self.render();
            } );
        };

        self.drawWalls = function ( width, depth, height ) {
            for(var i = self.walls.children.length - 1; i >= 0; i--) {
                 var obj = self.walls.children[i];
                 self.walls.remove(obj);
            }

            var wall1 = self.rectShape( width, height, 0x8888fc );
            wall1.rotation.x = Math.PI / 2;
            wall1.position.set(0, depth/2, height/2);
            self.walls.add(wall1);

            var wall2 = self.rectShape( height, depth, 0x8888dc );
            wall2.rotation.y = Math.PI / 2;
            wall2.position.set(-width/2, 0, height/2);
            self.walls.add(wall2);

            var wall3 = self.rectShape( width, height, 0x8888fc );
            wall3.rotation.x = -Math.PI / 2;
            wall3.position.set(0, -depth/2, height/2);
            self.walls.add(wall3);

            var wall4 = self.rectShape( height, depth, 0x8888dc );
            wall4.rotation.y = -Math.PI / 2;
            wall4.position.set(width/2, 0, height/2);
            self.walls.add(wall4);
        }

        self.rectShape = function ( rectLength, rectWidth, color ) {
            var rectShape = new THREE.Shape();
            rectShape.moveTo( -rectLength/2,-rectWidth/2 );
            rectShape.lineTo( -rectLength/2, rectWidth/2 );
            rectShape.lineTo( rectLength/2, rectWidth/2 );
            rectShape.lineTo( rectLength/2, -rectWidth/2 );
            rectShape.lineTo( -rectLength/2, -rectWidth/2 );
            var rectGeom = new THREE.ShapeGeometry( rectShape );
            return new THREE.Mesh( rectGeom, new THREE.MeshBasicMaterial( { color: color } ) ) ;
        }

        self.fixZPosition = function ( model ) {
            var bedLowMinZ = 0.0;
            var boundaryBox = new THREE.Box3().setFromObject(model);
            boundaryBox.min.sub(model.position);
            boundaryBox.max.sub(model.position);
            model.position.z -= model.position.z + boundaryBox.min.z - bedLowMinZ;
        }

        self.slice = function() {
            var form = new FormData();
            form.append("file", self.blobFromModel(self.model), self.slicingViewModel.file());
            $.ajax({
                url: API_BASEURL + "files/local",
                type: "POST",
                data: form,
                processData: false,
                contentType: false,
                // On success
                success: function(data) {
                    var slicingVM = self.slicingViewModel;

                    var destinationFilename = slicingVM._sanitize(slicingVM.destinationFilename());

                    var destinationExtensions = slicingVM.data[slicingVM.slicer()] && slicingVM.data[slicingVM.slicer()].extensions && slicingVM.data[slicingVM.slicer()].extensions.destination
                                                ? slicingVM.data[slicingVM.slicer()].extensions.destination
                                                : ["???"];
                    if (!_.any(destinationExtensions, function(extension) {
                            return _.endsWith(destinationFilename.toLowerCase(), "." + extension.toLowerCase());
                        })) {
                        destinationFilename = destinationFilename + "." + destinationExtensions[0];
                    }

                    var data = {
                        command: "slice",
                        slicer: slicingVM.slicer(),
                        profile: slicingVM.profile(),
                        printerProfile: slicingVM.printerProfile(),
                        destination: destinationFilename,
                        position: { "x": self.ORIGIN_OFFSET_X_MM+self.model.position.x,
                            "y": self.ORIGIN_OFFSET_Y_MM+self.model.position.y }
                    };
                    _.extend(data, self.basicOverridesViewModel.toJS());
                    _.extend(data, self.advancedOverridesViewModel.toJS());

                    if (slicingVM.afterSlicing() == "print") {
                        data["print"] = true;
                    } else if (slicingVM.afterSlicing() == "select") {
                        data["select"] = true;
                    }

                    $.ajax({
                        url: API_BASEURL + "files/" + slicingVM.target + "/" + slicingVM.file(),
                        type: "POST",
                        dataType: "json",
                        contentType: "application/json; charset=UTF-8",
                        data: JSON.stringify(data)
                    });
                }
            });
        };

        self.blobFromModel = function( model ) {
    	    var exporter = new THREE.STLBinaryExporter();
    	    return new Blob([exporter.parse(model)], {type: "text/plain"});
        }

        self.render = function() {
            self.orbitControls.update();
            self.transformControls.update();
            self.renderer.render( self.scene, self.camera );
        };

        self.init();
        self.render();
    }

    // view model class, parameters for constructor, container to bind to
    OCTOPRINT_VIEWMODELS.push([
        SlicerViewModel,

        // e.g. loginStateViewModel, settingsViewModel, ...
        [ "slicingViewModel", "basicOverridesViewModel", "advancedOverridesViewModel" ],

        // e.g. #settings_plugin_slicer, #tab_plugin_slicer, ...
        [ "#slicer" ]
    ]);
});
