/*
 * View model for OctoPrint-Slicer
 *
 * Author: Kenneth Jiang
 * License: AGPLv3
 */
$(function() {
    function SlicerViewModel(parameters) {
        var self = this;

        // assign the injected parameters, e.g.:
        // self.loginStateViewModel = parameters[0];
        // self.settingsViewModel = parameters[1];

        // TODO: Implement your plugin's view model here.
        $(document).on("click", ".btn-mini[title='Slice']", function(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            $('a[href="#tab_plugin_slicer"]').tab('show');
        });


            var container;

            var camera, cameraTarget, scene, renderer,
            CANVAS_WIDTH = 588,
            CANVAS_HEIGHT = 588;

            init();
            animate();

            function init() {
                container = document.getElementById( 'slicer-canvas' );

                camera = new THREE.PerspectiveCamera( 35, 1.0, 1, 15 );
                camera.position.set( 3, 0.15, 3 );

                cameraTarget = new THREE.Vector3( 0, -0.25, 0 );

                scene = new THREE.Scene();

                // ASCII file

                var loader = new THREE.STLLoader();
                loader.load( 'http://threejs.org/examples/models/stl/ascii/slotted_disk.stl', function ( geometry ) {

                    var material = new THREE.MeshPhongMaterial( { color: 0xff5533, specular: 0x111111, shininess: 200 } );
                    var mesh = new THREE.Mesh( geometry, material );

                    mesh.position.set( 0, - 0.25, 0.6 );
                    mesh.rotation.set( 0, - Math.PI / 2, 0 );
                    mesh.scale.set( 0.5, 0.5, 0.5 );

                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    scene.add( mesh );

                } );


                // Lights

                scene.add( new THREE.AmbientLight(0xffffff, 1.0) );

                // renderer

                renderer = new THREE.WebGLRenderer( { antialias: true } );
                renderer.setSize( CANVAS_WIDTH, CANVAS_HEIGHT );
                renderer.setPixelRatio( window.devicePixelRatio );

                renderer.gammaInput = true;
                renderer.gammaOutput = true;

                container.appendChild( renderer.domElement );

            }

            function animate() {

                requestAnimationFrame( animate );

                render();
            }

            function render() {

                camera.lookAt( cameraTarget );

                renderer.render( scene, camera );

            }


//        self.loadSTL(BASEURL + "downloads/files/" + "local" + "/" + "fish_fossilz.stl");
    }

    // view model class, parameters for constructor, container to bind to
    OCTOPRINT_VIEWMODELS.push([
        SlicerViewModel,

        // e.g. loginStateViewModel, settingsViewModel, ...
        [ /* "loginStateViewModel", "settingsViewModel" */ ],

        // e.g. #settings_plugin_slicer, #tab_plugin_slicer, ...
        [ /* ... */ ]
    ]);
});
