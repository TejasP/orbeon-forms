/**
 *  Copyright (C) 2012 Orbeon, Inc.
 *
 *  This program is free software; you can redistribute it and/or modify it under the terms of the
 *  GNU Lesser General Public License as published by the Free Software Foundation; either version
 *  2.1 of the License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 *  without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *  See the GNU Lesser General Public License for more details.
 *
 *  The full text of the license is available at http://www.gnu.org/copyleft/lesser.html
 */
package org.orbeon.oxf.fb

import org.orbeon.oxf.xforms.action.XFormsAPI._
import org.orbeon.scaxon.XML._
import org.orbeon.oxf.fb.FormBuilderFunctions._
import org.orbeon.oxf.fb.ControlOps._
import org.orbeon.oxf.fb.ContainerOps._
import org.orbeon.saxon.om.NodeInfo

object DataModel {


    // Whether the current form has a custom instance
    def isCustomInstance = {
        val metadataInstance = model("fr-form-model").get.getVariable("is-custom-instance")
        (metadataInstance ne null) && effectiveBooleanValue(metadataInstance)
    }
    
    private val bindWithName: PartialFunction[NodeInfo, NodeInfo] =
        { case bind if exists(bind \@ "name") ⇒ bind }
    
    private def childrenBindsWithNames(bind: NodeInfo) =
        bind \ (XF → "bind") collect bindWithName

    private def ancestorOrSelfBindsWithNames(bind: NodeInfo) =
        bind ancestorOrSelf (XF → "bind") collect bindWithName

    // Create a new data model from the binds
    def dataModelFromBinds(inDoc: NodeInfo) = {

        def insertChildren(holder: NodeInfo, bind: NodeInfo): NodeInfo = {
            
            val newChildren =
                childrenBindsWithNames(bind) map
                    (bind ⇒ insertChildren(elementInfo(bind attValue "name" ), bind))

            insert(into = holder, origin = newChildren)

            holder
        }
        
        findTopLevelBind(inDoc) map (insertChildren(elementInfo("form"), _)) orNull
    }
    
    private def foreachBindWithName(inDoc: NodeInfo)(op: NodeInfo ⇒ Any) {
        def update(bind: NodeInfo) {
            childrenBindsWithNames(bind) foreach { child ⇒
                op(child)
                update(child)
            }
        }
        
        findTopLevelBind(inDoc) foreach (update(_))
    }

    // Update binds for automatic mode
    def updateBindsForAutomatic(inDoc: NodeInfo) =
        foreachBindWithName(inDoc) { child ⇒
            delete(child \@ "nodeset")
            ensureAttribute(child, "ref", child attValue "name")
        }

    // Update binds for custom mode
    def updateBindsForCustom(inDoc: NodeInfo) = {

        val allContainerNames = getAllContainerControls(inDoc) map (e ⇒ controlName(e attValue "id")) toSet

        foreachBindWithName(inDoc) { child ⇒
            def path = (ancestorOrSelfBindsWithNames(child) map (_ attValue "name") reverse) mkString "/"

            delete(child \@ "nodeset")
            if (allContainerNames(child attValue "name"))
                delete(child \@ "ref")
            else
                ensureAttribute(child, "ref", path)
        }
    }

    // Find a bind ref by name (deannotate the expression if needed)
    def getBindRef(inDoc: NodeInfo, name: String) =
        findBindByName(inDoc, name) flatMap
            (bindRefOrNodeset(_)) map
                (ref ⇒ deAnnotatedBindRef(ref.stringValue))

    // Set a bind ref by name (annotate the expression if needed)
    def setBindRef(inDoc: NodeInfo, name: String, value: String) =
        findBindByName(inDoc, name) foreach { bind ⇒
            delete(bind \@ "nodeset")
            ensureAttribute(bind, "ref", annotatedBindRefIfNeeded(value))
        }

    // XForms callers
    def getBindRefOrEmpty(inDoc: NodeInfo, name: String) = getBindRef(inDoc, name).orNull

    private val AnnotatedBindRef = """\((.*)\),\s*instance\('fb-readonly'\)$""".r

    def annotatedBindRef(ref: String) = "(" + ref + "), instance('fb-readonly')"
    def deAnnotatedBindRef(ref: String) = AnnotatedBindRef.replaceFirstIn(ref.trim, "$1").trim
    
    def annotatedBindRefIfNeeded(ref: String) =
        if (isCustomInstance) annotatedBindRef(ref) else ref
}